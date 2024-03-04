import { MetadataApi } from "@cowprotocol/app-data";
import { BaseTransaction } from "@gnosis.pm/safe-apps-sdk";
import { Address, encodeFunctionData, parseUnits } from "viem";

import { FALLBACK_STATES, PRICE_ORACLES } from "#/lib/types";
import { ChainId, publicClientsFromIds } from "#/utils/chainsPublicClients";

import { cowAmmModuleAbi } from "./abis/cowAmmModule";
import { gnosisSafeV12 } from "./abis/gnosisSafeV12";
import { signatureVerifierMuxerAbi } from "./abis/signatureVerifierMuxer";
import {
  COMPOSABLE_COW_ADDRESS,
  COW_AMM_MODULE_ADDRESS,
  EXTENSIBLE_FALLBACK_ADDRESS,
} from "./contracts";
import {
  encodePriceOracleData,
  PRICE_ORACLES_ADDRESSES,
} from "./encodePriceOracleData";
import { uploadAppData } from "./orderBookApi/uploadAppData";
import { ammFormSchema } from "./schema";

export enum TRANSACTION_TYPES {
  SET_FALLBACK_HANDLER = "SET_FALLBACK_HANDLER",
  SET_DOMAIN_VERIFIER = "SET_DOMAIN_VERIFIER",
  ENABLE_COW_AMM_MODULE = "ENABLE_COW_AMM_MODULE",
  CREATE_COW_AMM = "CREATE_COW_AMM",
  EDIT_COW_AMM = "EDIT_COW_AMM",
  STOP_COW_AMM = "STOP_COW_AMM",
}

export interface BaseArgs {
  type: TRANSACTION_TYPES;
}

export interface setFallbackHandlerArgs extends BaseArgs {
  type: TRANSACTION_TYPES.SET_FALLBACK_HANDLER;
  safeAddress: Address;
}
export interface setDomainVerifierArgs extends BaseArgs {
  type: TRANSACTION_TYPES.SET_DOMAIN_VERIFIER;
  safeAddress: Address;
  domainSeparator: Address;
}
export interface enableCowAmmModuleArgs extends BaseArgs {
  type: TRANSACTION_TYPES.ENABLE_COW_AMM_MODULE;
  chainId: ChainId;
  safeAddress: Address;
}

export interface stopCowAmmArgs extends BaseArgs {
  type: TRANSACTION_TYPES.STOP_COW_AMM;
  chainId: ChainId;
}

export interface creteCowAmmArgs extends BaseArgs {
  type: TRANSACTION_TYPES.CREATE_COW_AMM;
  token0: Address;
  token1: Address;
  token0Decimals: number;
  minTradedToken0: number;
  priceOracle: PRICE_ORACLES;
  appData: `0x${string}`;
  balancerPoolId?: `0x${string}`;
  uniswapV2Pair?: Address;
  chainId: ChainId;
}

export interface editCowAmmArgs extends Omit<creteCowAmmArgs, "type"> {
  type: TRANSACTION_TYPES.EDIT_COW_AMM;
}

interface ITransaction<T> {
  createRawTx(args: T): BaseTransaction;
}

class FallbackHandlerSetTx implements ITransaction<setFallbackHandlerArgs> {
  createRawTx({ safeAddress }: setFallbackHandlerArgs): BaseTransaction {
    return {
      to: safeAddress,
      value: "0",
      data: encodeFunctionData({
        abi: signatureVerifierMuxerAbi,
        functionName: "setFallbackHandler",
        args: [EXTENSIBLE_FALLBACK_ADDRESS],
      }),
    };
  }
}

class DomainVerifierSetTx implements ITransaction<setDomainVerifierArgs> {
  createRawTx({
    safeAddress,
    domainSeparator,
  }: setDomainVerifierArgs): BaseTransaction {
    return {
      to: safeAddress,
      value: "0",
      data: encodeFunctionData({
        abi: signatureVerifierMuxerAbi,
        functionName: "setDomainVerifier",
        args: [domainSeparator, COMPOSABLE_COW_ADDRESS],
      }),
    };
  }
}
class CowAmmEnableModuleTx implements ITransaction<enableCowAmmModuleArgs> {
  createRawTx({
    safeAddress,
    chainId,
  }: enableCowAmmModuleArgs): BaseTransaction {
    return {
      to: safeAddress,
      value: "0",
      data: encodeFunctionData({
        abi: gnosisSafeV12,
        functionName: "enableModule",
        args: [COW_AMM_MODULE_ADDRESS[chainId]],
      }),
    };
  }
}

class CowAmmCreateTx implements ITransaction<creteCowAmmArgs> {
  createRawTx({
    token0,
    token1,
    token0Decimals,
    minTradedToken0,
    priceOracle,
    balancerPoolId,
    uniswapV2Pair,
    appData,
    chainId,
  }: creteCowAmmArgs): BaseTransaction {
    const priceOracleData = encodePriceOracleData({
      priceOracle,
      balancerPoolId,
      uniswapV2Pair,
    });

    return {
      to: COW_AMM_MODULE_ADDRESS[chainId],
      value: "0",
      data: encodeFunctionData({
        abi: cowAmmModuleAbi,
        functionName: "createAmm",
        args: [
          token0,
          token1,
          parseUnits(String(minTradedToken0), token0Decimals),
          PRICE_ORACLES_ADDRESSES[chainId][priceOracle] as Address,
          priceOracleData,
          appData,
        ],
      }),
    };
  }
}

class CowAmmEditTx implements ITransaction<editCowAmmArgs> {
  createRawTx({
    token0,
    token1,
    token0Decimals,
    minTradedToken0,
    priceOracle,
    balancerPoolId,
    uniswapV2Pair,
    appData,
    chainId,
  }: editCowAmmArgs): BaseTransaction {
    const priceOracleData = encodePriceOracleData({
      priceOracle,
      balancerPoolId,
      uniswapV2Pair,
    });

    return {
      to: COW_AMM_MODULE_ADDRESS[chainId],
      value: "0",
      data: encodeFunctionData({
        abi: cowAmmModuleAbi,
        functionName: "replaceAmm",
        args: [
          token0,
          token1,
          parseUnits(String(minTradedToken0), token0Decimals),
          PRICE_ORACLES_ADDRESSES[chainId][priceOracle] as Address,
          priceOracleData,
          appData,
        ],
      }),
    };
  }
}

class CowAmmStopTx implements ITransaction<stopCowAmmArgs> {
  createRawTx({ chainId }: stopCowAmmArgs): BaseTransaction {
    return {
      to: COW_AMM_MODULE_ADDRESS[chainId],
      value: "0",
      data: encodeFunctionData({
        abi: cowAmmModuleAbi,
        functionName: "closeAmm",
      }),
    };
  }
}
export interface TransactionBindings {
  [TRANSACTION_TYPES.SET_FALLBACK_HANDLER]: setFallbackHandlerArgs;
  [TRANSACTION_TYPES.SET_DOMAIN_VERIFIER]: setDomainVerifierArgs;
  [TRANSACTION_TYPES.ENABLE_COW_AMM_MODULE]: enableCowAmmModuleArgs;
  [TRANSACTION_TYPES.CREATE_COW_AMM]: creteCowAmmArgs;
  [TRANSACTION_TYPES.STOP_COW_AMM]: stopCowAmmArgs;
  [TRANSACTION_TYPES.EDIT_COW_AMM]: editCowAmmArgs;
}

export type AllTransactionArgs = TransactionBindings[keyof TransactionBindings];

const TRANSACTION_CREATORS: {
  [key in keyof TransactionBindings]: new () => ITransaction<
    TransactionBindings[key]
  >;
} = {
  [TRANSACTION_TYPES.SET_FALLBACK_HANDLER]: FallbackHandlerSetTx,
  [TRANSACTION_TYPES.SET_DOMAIN_VERIFIER]: DomainVerifierSetTx,
  [TRANSACTION_TYPES.ENABLE_COW_AMM_MODULE]: CowAmmEnableModuleTx,
  [TRANSACTION_TYPES.CREATE_COW_AMM]: CowAmmCreateTx,
  [TRANSACTION_TYPES.STOP_COW_AMM]: CowAmmStopTx,
  [TRANSACTION_TYPES.EDIT_COW_AMM]: CowAmmEditTx,
};

export class TransactionFactory {
  static createRawTx<T extends TRANSACTION_TYPES>(
    type: T,
    args: TransactionBindings[T],
  ): BaseTransaction {
    const TransactionCreator = TRANSACTION_CREATORS[type];
    const txCreator = new TransactionCreator();
    return txCreator.createRawTx(args);
  }
}

export async function buildTxAMMArgs({
  data,
  transactionType,
}: {
  data: typeof ammFormSchema._type;
  transactionType:
    | TRANSACTION_TYPES.CREATE_COW_AMM
    | TRANSACTION_TYPES.EDIT_COW_AMM;
}): Promise<AllTransactionArgs[]> {
  const setFallbackTx = {
    type: TRANSACTION_TYPES.SET_FALLBACK_HANDLER,
    safeAddress: data.safeAddress,
  } as setFallbackHandlerArgs;
  const DomainVerifierSetTx = {
    type: TRANSACTION_TYPES.SET_DOMAIN_VERIFIER,
    safeAddress: data.safeAddress,
    domainSeparator: data.domainSeparator,
  } as setDomainVerifierArgs;
  const _fallbackTxs = (() => {
    switch (data.fallbackSetupState) {
      case FALLBACK_STATES.HAS_NOTHING:
        return [setFallbackTx, DomainVerifierSetTx];
      case FALLBACK_STATES.HAS_EXTENSIBLE_FALLBACK:
        return [DomainVerifierSetTx];
      default:
        return [];
    }
  })();

  const publicClient = publicClientsFromIds[data.chainId as ChainId];

  const isCoWAmmModuleEnabled = await publicClient.readContract({
    address: data.safeAddress as Address,
    abi: gnosisSafeV12,
    functionName: "isModuleEnabled",
    args: [COW_AMM_MODULE_ADDRESS[data.chainId as ChainId]],
  });
  const enableCoWAmmTxs = isCoWAmmModuleEnabled
    ? []
    : [
        {
          type: TRANSACTION_TYPES.ENABLE_COW_AMM_MODULE,
          safeAddress: data.safeAddress as Address,
          chainId: data.chainId as ChainId,
        } as const,
      ];

  const metadataApi = new MetadataApi();

  const appDataDoc = await metadataApi.generateAppDataDoc({
    appCode: "CoW AMM Bleu Ui",
  });
  const { appDataHex, appDataContent } =
    await metadataApi.appDataToCid(appDataDoc);

  await uploadAppData({
    fullAppData: appDataContent,
    appDataHex,
    chainId: data.chainId as ChainId,
  });

  return [
    // ...fallbackTxs,
    ...enableCoWAmmTxs,
    {
      type: transactionType,
      token0: data.token0.address as Address,
      token1: data.token1.address as Address,
      token0Decimals: data.token0.decimals,
      minTradedToken0: data.minTradedToken0,
      priceOracle: data.priceOracle as PRICE_ORACLES,
      appData: appDataHex as `0x${string}`,
      balancerPoolId: data.balancerPoolId as `0x${string}` | undefined,
      uniswapV2Pair: data.uniswapV2Pair as Address | undefined,
      chainId: data.chainId as ChainId,
    } as const,
  ];
}
