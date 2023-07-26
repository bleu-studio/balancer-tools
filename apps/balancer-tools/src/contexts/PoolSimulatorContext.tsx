"use client";

import { PoolQuery } from "@bleu-balancer-tools/gql/src/balancer/__generated__/Ethereum";
import { AMM } from "@bleu-balancer-tools/math-poolsimulator/src";
import {
  ExtendedGyroEV2,
  GyroEPoolPairData,
} from "@bleu-balancer-tools/math-poolsimulator/src/gyroE";
import {
  ExtendedMetaStableMath,
  MetaStablePoolPairData,
} from "@bleu-balancer-tools/math-poolsimulator/src/metastable";
import { NetworkChainId } from "@bleu-balancer-tools/utils";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from "react";

import { PoolAttribute } from "#/components/SearchPoolForm";
import { pools } from "#/lib/gql";

export interface TokensData {
  symbol: string;
  balance: number;
  decimal: number;
  rate?: number;
  weight?: number;
}

export interface MetaStableParams {
  ampFactor?: number;
  swapFee?: number;
}

export interface GyroEParams {
  alpha?: number;
  beta?: number;
  lambda?: number;
  c?: number;
  s?: number;
  swapFee?: number;
  tauAlphaX: number;
  tauAlphaY: number;
  tauBetaX: number;
  tauBetaY: number;
  u: number;
  v: number;
  w: number;
  z: number;
  dSq: number;
}

export enum PoolTypeEnum {
  MetaStable = "MetaStable",
  GyroE = "GyroE",
}

export type PoolParams = MetaStableParams & GyroEParams;
export type PoolType = PoolTypeEnum;
export type PoolPairData = MetaStablePoolPairData | GyroEPoolPairData;
export const POOL_TYPES: PoolType[] = [
  PoolTypeEnum.MetaStable,
  PoolTypeEnum.GyroE,
];
export interface AnalysisData<T extends PoolType> {
  tokens: TokensData[];
  poolType?: T;
  poolParams?: T extends PoolTypeEnum.MetaStable
    ? MetaStableParams
    : GyroEParams;
}

interface PoolSimulatorContextType {
  initialData: AnalysisData<PoolType>;
  customData: AnalysisData<PoolType>;
  analysisToken: TokensData;
  currentTabToken: TokensData;
  setAnalysisTokenBySymbol: (symbol: string) => void;
  setCurrentTabTokenBySymbol: (symbol: string) => void;
  setAnalysisTokenByIndex: (index: number) => void;
  setCurrentTabTokenByIndex: (index: number) => void;
  setInitialData: (data: AnalysisData<PoolType>) => void;
  setCustomData: (data: AnalysisData<PoolType>) => void;
  handleImportPoolParametersById: (data: PoolAttribute) => void;
  newPoolImportedFlag: boolean;
  isGraphLoading: boolean;
  setIsGraphLoading: (value: boolean) => void;
  generateURL: () => string;
  poolType: PoolType;
  setPoolType: (value: PoolType) => void;
  initialAMM?: AMM<PoolPairData>;
  customAMM?: AMM<PoolPairData>;
}

const defaultPool = {
  //wstETH - WETH on Mainnet/Ethereum
  id: "0x32296969ef14eb0c6d29669c550d4a0449130230000200000000000000000080",
  network: NetworkChainId.ETHEREUM.toString(),
};

function convertAnalysisDataToAMM(data: AnalysisData<PoolType>) {
  if (!data.poolType) return;

  switch (data.poolType) {
    case PoolTypeEnum.MetaStable: {
      const { ampFactor, swapFee } = data.poolParams as MetaStableParams;
      return new AMM(
        new ExtendedMetaStableMath({
          amp: String(ampFactor),
          swapFee: String(swapFee),
          totalShares: String(
            data.tokens.reduce((acc, token) => acc + token.balance, 0)
          ),
          tokens: data.tokens.map((token) => ({
            address: String(token.symbol), // math use address as key, but we will use symbol because custom token will not have address
            balance: String(token.balance),
            decimals: token.decimal,
            priceRate: String(token.rate),
          })),
          tokensList: data.tokens.map((token) => String(token.symbol)),
        })
      );
    }
    case PoolTypeEnum.GyroE: {
      const gyroEParams = data.poolParams as GyroEParams;
      return new AMM(
        new ExtendedGyroEV2({
          swapFee: String(gyroEParams.swapFee),
          totalShares: String(
            data.tokens.reduce((acc, token) => acc + token.balance, 0)
          ),
          tokens: data.tokens.map((token) => ({
            address: String(token.symbol), // math use address as key, but we will use symbol because custom token will not have address
            balance: String(token.balance),
            decimals: token.decimal,
            priceRate: String(token.rate),
          })),
          tokensList: data.tokens.map((token) => String(token.symbol)),
          gyroEParams: {
            alpha: String(gyroEParams.alpha),
            beta: String(gyroEParams.beta),
            lambda: String(gyroEParams.lambda),
            c: String(gyroEParams.c),
            s: String(gyroEParams.s),
          },
          derivedGyroEParams: {
            tauAlphaX: String(gyroEParams.tauAlphaX),
            tauAlphaY: String(gyroEParams.tauAlphaY),
            tauBetaX: String(gyroEParams.tauBetaX),
            tauBetaY: String(gyroEParams.tauBetaY),
            u: String(gyroEParams.u),
            v: String(gyroEParams.v),
            w: String(gyroEParams.w),
            z: String(gyroEParams.z),
            dSq: String(gyroEParams.dSq),
          },
          tokenRates: data.tokens.map((token) => String(token.rate)),
        })
      );
    }
  }
}

export const PoolSimulatorContext = createContext(
  {} as PoolSimulatorContextType
);

export function PoolSimulatorProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const { push } = useRouter();
  const defaultAnalysisData: AnalysisData<PoolType> = {
    poolParams: undefined,
    tokens: [],
  };

  const defaultTokensData: TokensData = {
    symbol: "",
    balance: 0,
    rate: 0,
    decimal: 0,
  };

  const [initialData, setInitialData] =
    useState<AnalysisData<PoolType>>(defaultAnalysisData);
  const [customData, setCustomData] =
    useState<AnalysisData<PoolType>>(defaultAnalysisData);
  const [initialAMM, setInitialAMM] = useState<AMM<PoolPairData>>();
  const [customAMM, setCustomAMM] = useState<AMM<PoolPairData>>();
  const [analysisToken, setAnalysisToken] =
    useState<TokensData>(defaultTokensData);
  const [currentTabToken, setCurrentTabToken] =
    useState<TokensData>(defaultTokensData);
  const [newPoolImportedFlag, setNewPoolImportedFlag] =
    useState<boolean>(false);
  const [poolType, setPoolType] = useState<PoolType>(PoolTypeEnum.MetaStable);

  const [isGraphLoading, setIsGraphLoading] = useState<boolean>(false);

  function setAnalysisTokenBySymbol(symbol: string) {
    const token = initialData.tokens.find((token) => token.symbol === symbol);
    if (token) setAnalysisToken(token);
  }

  function setCurrentTabTokenBySymbol(symbol: string) {
    const token = initialData.tokens.find((token) => token.symbol === symbol);
    if (token) setCurrentTabToken(token);
  }

  function setAnalysisTokenByIndex(index: number) {
    const token = initialData.tokens[index];
    if (token) setAnalysisToken(token);
  }

  function setCurrentTabTokenByIndex(index: number) {
    const token = initialData.tokens[index];
    if (token) setCurrentTabToken(token);
  }

  function generateURL() {
    const jsonState = JSON.stringify({ initialData, customData });
    const encodedState = encodeURIComponent(jsonState);
    return `${window.location.origin}${window.location.pathname}#${encodedState}`;
  }

  useEffect(() => {
    if (pathname === "/poolsimulator/analysis") push(generateURL());
  }, [initialData, customData]);

  useEffect(() => {
    if (
      initialData.tokens.length < 2 &&
      !initialData.poolType &&
      !initialData.poolParams?.swapFee // all pool type have swapFee
    )
      return;
    setInitialAMM(convertAnalysisDataToAMM(initialData));
  }, [initialData]);

  useEffect(() => {
    if (
      customData.tokens.length < 2 &&
      !customData.poolType &&
      !customData.poolParams?.swapFee // all pool type have swapFee
    )
      return;
    setCustomAMM(convertAnalysisDataToAMM(customData));
  }, [customData]);

  useEffect(() => {
    if (window.location.hash) {
      const encodedState = window.location.hash.substring(1);
      const decodedState = decodeURIComponent(encodedState);
      try {
        const state = JSON.parse(decodedState);
        setInitialData(state.initialData);
        setCustomData(state.customData);
      } catch (error) {
        throw new Error("Invalid state");
      }
    }
  }, []);

  function convertGqlToAnalysisData(
    poolData: PoolQuery
  ): AnalysisData<PoolType> {
    switch (poolData.pool?.poolType) {
      case PoolTypeEnum.GyroE:
        return {
          poolType: PoolTypeEnum.GyroE,
          poolParams: {
            alpha: Number(poolData?.pool?.alpha),
            beta: Number(poolData?.pool?.beta),
            lambda: Number(poolData?.pool?.lambda),
            c: Number(poolData?.pool?.c),
            s: Number(poolData?.pool?.s),
            swapFee: Number(poolData?.pool?.swapFee),
            tauAlphaX: Number(poolData?.pool?.tauAlphaX),
            tauAlphaY: Number(poolData?.pool?.tauAlphaY),
            tauBetaX: Number(poolData?.pool?.tauBetaX),
            tauBetaY: Number(poolData?.pool?.tauBetaY),
            u: Number(poolData?.pool?.u),
            v: Number(poolData?.pool?.v),
            w: Number(poolData?.pool?.w),
            z: Number(poolData?.pool?.z),
            dSq: Number(poolData?.pool?.dSq),
          },
          tokens:
            poolData?.pool?.tokens
              ?.filter((token) => token.address !== poolData?.pool?.address)
              .map((token) => ({
                symbol: token?.symbol,
                balance: Number(token?.balance),
                rate: Number(token?.priceRate),
                decimal: Number(token?.decimals),
              })) || [],
        };
      case PoolTypeEnum.MetaStable:
        return {
          poolType: PoolTypeEnum.MetaStable,
          poolParams: {
            swapFee: Number(poolData?.pool?.swapFee),
            ampFactor: Number(poolData?.pool?.amp),
          },
          tokens:
            poolData?.pool?.tokens
              ?.filter((token) => token.address !== poolData?.pool?.address)
              .map((token) => ({
                symbol: token?.symbol,
                balance: Number(token?.balance),
                rate: Number(token?.priceRate),
                decimal: Number(token?.decimals),
              })) || [],
        };
      default:
        // Handle any other pool type here if needed
        return {
          poolType: PoolTypeEnum.MetaStable,
          poolParams: {
            swapFee: Number(poolData?.pool?.swapFee),
            ampFactor: Number(poolData?.pool?.amp),
          },
          tokens:
            poolData?.pool?.tokens
              ?.filter((token) => token.address !== poolData?.pool?.address)
              .map((token) => ({
                symbol: token?.symbol,
                balance: Number(token?.balance),
                rate: Number(token?.priceRate),
                decimal: Number(token?.decimals),
              })) || [],
        };
    }
  }

  async function handleImportPoolParametersById(formData: PoolAttribute) {
    const poolData = await pools.gql(formData.network || "1").Pool({
      poolId: formData.poolId,
    });
    if (!poolData) return;
    setNewPoolImportedFlag(!newPoolImportedFlag);
    setInitialData(convertGqlToAnalysisData(poolData));
    setCustomData(convertGqlToAnalysisData(poolData));
  }

  useEffect(() => {
    if (pathname === "/poolsimulator") {
      setIsGraphLoading(false);
      handleImportPoolParametersById({
        poolId: defaultPool.id,
        network: defaultPool.network,
      });
    }
    if (pathname === "/poolsimulator/analysis") {
      setIsGraphLoading(false);
    }
  }, [pathname]);

  return (
    <PoolSimulatorContext.Provider
      value={{
        initialData,
        setInitialData,
        customData,
        setCustomData,
        analysisToken,
        setAnalysisTokenBySymbol,
        setAnalysisTokenByIndex,
        currentTabToken,
        setCurrentTabTokenBySymbol,
        setCurrentTabTokenByIndex,
        handleImportPoolParametersById,
        newPoolImportedFlag,
        isGraphLoading,
        setIsGraphLoading,
        generateURL,
        initialAMM,
        customAMM,
        poolType,
        setPoolType,
      }}
    >
      {children}
    </PoolSimulatorContext.Provider>
  );
}

export function usePoolSimulator() {
  const context = useContext(PoolSimulatorContext);
  return context;
}
