import { NetworkChainId } from "@balancer-pool-metadata/shared";
import { parseFixed } from "@ethersproject/bignumber";
import { Dispatch, useEffect, useState } from "react";

import { PoolMetadataAttribute } from "#/contexts/PoolMetadataContext";
import { UserBalanceOpKind } from "#/lib/internal-balance-helper";
import { pinJSON } from "#/lib/ipfs";
import { useNetwork, useWaitForTransaction } from "#/wagmi";
import {
  usePoolMetadataRegistrySetPoolMetadata,
  usePreparePoolMetadataRegistrySetPoolMetadata,
  usePrepareVaultManageUserBalance,
  useVaultManageUserBalance,
} from "#/wagmi/generated";

export enum TransactionStatus {
  AUTHORIZING = "Approve this transaction",
  PINNING = "Pinning metadata...",
  CONFIRMING = "Set metadata on-chain",
  WAITING_APPROVAL = "Waiting for your wallet approvement...",
  SUBMITTING = "Writing on-chain",
  CONFIRMED = "Transaction was a success",
  PINNING_ERROR = "The transaction has failed",
  WRITE_ERROR = "The transaction has failed",
}

enum NotificationVariant {
  NOTIFICATION = "notification",
  PENDING = "pending",
  ALERT = "alert",
  SUCCESS = "success",
}

type Notification = {
  title: string;
  description: string;
  variant: NotificationVariant;
};

type TransactionHookResult = {
  handleTransaction: () => void;
  isTransactionDisabled: boolean;
  notification: Notification | null;
  transactionStatus: TransactionStatus;
  isNotifierOpen: boolean;
  setIsNotifierOpen: Dispatch<boolean>;
  transactionUrl: string | undefined;
};

const NOTIFICATION_MAP = {
  [TransactionStatus.PINNING]: {
    title: "Approve confirmed! ",
    description: "Pinning file to IPFS",
    variant: NotificationVariant.NOTIFICATION,
  },
  [TransactionStatus.CONFIRMING]: {
    title: "Confirme pending... ",
    description: "Set metadata on-chain",
    variant: NotificationVariant.PENDING,
  },
  [TransactionStatus.SUBMITTING]: {
    title: "Update confirmed! ",
    description: "Metadata is being updated!",
    variant: NotificationVariant.NOTIFICATION,
  },
  [TransactionStatus.CONFIRMED]: {
    title: "Great!",
    description: "The update was a success!",
    variant: NotificationVariant.SUCCESS,
  },
  [TransactionStatus.PINNING_ERROR]: {
    title: "Error!",
    description: "the metadata update has failed",
    variant: NotificationVariant.ALERT,
  },
  [TransactionStatus.WRITE_ERROR]: {
    title: "Error!",
    description: "the metadata update has failed",
    variant: NotificationVariant.ALERT,
  },
};

export const NOTIFICATION_MAP_INTERNAL_BALANCES = {
  [TransactionStatus.WAITING_APPROVAL]: {
    title: "Confirme pending... ",
    description: "Waiting for your wallet approvement",
    variant: NotificationVariant.PENDING,
  },
  [TransactionStatus.SUBMITTING]: {
    title: "Wait just a little longer",
    description: "Your transaction is being made",
    variant: NotificationVariant.NOTIFICATION,
  },
  [TransactionStatus.CONFIRMED]: {
    title: "Great!",
    description: "The transaction was a success!",
    variant: NotificationVariant.SUCCESS,
  },
  [TransactionStatus.WRITE_ERROR]: {
    title: "Error!",
    description: "the transaction has failed",
    variant: NotificationVariant.ALERT,
  },
} as const;

export const networkUrls = {
  [NetworkChainId.MAINNET]: "https://etherscan.io/tx/",
  [NetworkChainId.GOERLI]: "https://goerli.etherscan.io/tx/",
  [NetworkChainId.POLYGON]: "https://polygonscan.com/tx/",
  [NetworkChainId.ARBITRUM]: "https://arbiscan.io/tx/",
};

function getNetworkUrl(chainId: NetworkChainId) {
  return networkUrls[chainId as keyof typeof networkUrls];
}

export function useMetadataTransaction({
  poolId,
  metadata,
}: {
  poolId: `0x${string}`;
  metadata: PoolMetadataAttribute[];
}): TransactionHookResult {
  const [ipfsCID, setIpfsCID] = useState("");
  const [isNotifierOpen, setIsNotifierOpen] = useState(false);
  const [isTransactionDisabled, setIsTransactionDisabled] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatus>(
    TransactionStatus.AUTHORIZING
  );
  const [transactionUrl, setTransactionUrl] = useState<string | undefined>();

  const { config } = usePreparePoolMetadataRegistrySetPoolMetadata({
    args: [poolId, ipfsCID],
  });
  const { write, data } = usePoolMetadataRegistrySetPoolMetadata(config);
  const { chain } = useNetwork();

  const handleSetTransactionLink = (hash: `0x${string}`) => {
    const baseTxUrl = getNetworkUrl(chain!.id);
    setTransactionUrl(`${baseTxUrl}${hash}`);
  };

  useEffect(() => {
    if (!data) return;
    const { wait, hash } = data;
    async function waitTransaction() {
      handleSetTransactionLink(hash);
      // Once the metadata is set on-chain, update the transaction status to SUBMITTING
      setTransactionStatus(TransactionStatus.SUBMITTING);
      setNotification(NOTIFICATION_MAP[TransactionStatus.SUBMITTING]);
      const receipt = await wait();

      if (receipt.status) {
        setTransactionStatus(TransactionStatus.CONFIRMED);
        setNotification(NOTIFICATION_MAP[TransactionStatus.CONFIRMED]);
      }
    }
    waitTransaction();
  }, [data]);

  const handleTransaction = async () => {
    if (isTransactionDisabled) {
      return;
    }

    setIsTransactionDisabled(true);

    if (transactionStatus === TransactionStatus.AUTHORIZING) {
      setTransactionStatus(TransactionStatus.PINNING);
      setNotification(NOTIFICATION_MAP[TransactionStatus.PINNING]);

      // Call function to approve transaction and pin metadata to IPFS here
      // Once the transaction is approved and the metadata is pinned, update the transaction status to CONFIRMING
      try {
        const value = await pinJSON(poolId, metadata);
        setIpfsCID(value);
        setTransactionStatus(TransactionStatus.CONFIRMING);
        setNotification(NOTIFICATION_MAP[TransactionStatus.CONFIRMING]);
        setIsTransactionDisabled(false);
      } catch (error) {
        setTransactionStatus(TransactionStatus.PINNING_ERROR);
        setNotification(NOTIFICATION_MAP[TransactionStatus.PINNING_ERROR]);
        setIsTransactionDisabled(false);
      }
    } else if (transactionStatus === TransactionStatus.CONFIRMING) {
      // Call function to set metadata on-chain here
      try {
        setTransactionStatus(TransactionStatus.WAITING_APPROVAL);
        write?.();
      } catch (error) {
        setTransactionStatus(TransactionStatus.WRITE_ERROR);
        setNotification(NOTIFICATION_MAP[TransactionStatus.WRITE_ERROR]);
        setIsTransactionDisabled(false);
      }
    }
  };

  const handleNotifier = () => {
    if (isNotifierOpen) {
      setIsNotifierOpen(false);
      setTimeout(() => {
        setIsNotifierOpen(true);
      }, 100);
    } else {
      setIsNotifierOpen(true);
    }
  };

  useEffect(() => {
    if (!notification) return;
    handleNotifier();
  }, [notification]);

  return {
    handleTransaction,
    isTransactionDisabled,
    notification,
    transactionStatus,
    isNotifierOpen,
    setIsNotifierOpen,
    transactionUrl,
  };
}

export function useInternalBalancesTransaction({
  userAddress,
  token,
}: {
  userAddress: `0x${string}`;
  //TODO change to useInternalBalances when subgraph is updated
  //https://linear.app/bleu-llc/issue/BAL-272/fix-internal-balance-token-attribute-on-subgraph
  token: any;
}) {
  const { chain } = useNetwork();
  const [isNotifierOpen, setIsNotifierOpen] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [transactionUrl, setTransactionUrl] = useState<string>();
  const [operationKind, setOperationKind] = useState<UserBalanceOpKind>();

  //Prepare data for transaction
  const userBalanceOp = {
    kind: operationKind as number,
    asset: token.token as `0x${string}`,
    amount: parseFixed(token.balance, 18),
    sender: userAddress as `0x${string}`,
    recipient: userAddress as `0x${string}`,
  };

  const { config } = usePrepareVaultManageUserBalance({
    args: [[userBalanceOp]],
  });

  const { data, write } = useVaultManageUserBalance(config);

  //trigger transaction
  function handleWithdraw() {
    setOperationKind(UserBalanceOpKind.WITHDRAW_INTERNAL);
    setNotification(
      NOTIFICATION_MAP_INTERNAL_BALANCES[TransactionStatus.WAITING_APPROVAL]
    );
  }

  //trigger the actual transaction
  useEffect(() => {
    if (!operationKind) return;
    write?.();
  }, [operationKind]);

  //handle transaction status
  useEffect(() => {
    if (!data) return;
    const { hash } = data;
    async function handleTransactionStatus() {
      if (!hash || !chain) return;
      const baseTxUrl = getNetworkUrl(chain!.id);
      setNotification(
        NOTIFICATION_MAP_INTERNAL_BALANCES[TransactionStatus.SUBMITTING]
      );
      setTransactionUrl(`${baseTxUrl}${hash}`);
    }
    switch (operationKind) {
      case UserBalanceOpKind.WITHDRAW_INTERNAL: {
        handleTransactionStatus();
      }
      default:
        return;
    }
  }, [data]);

  //check if transaction is confirmed
  useWaitForTransaction({
    hash: data?.hash,
    onSuccess() {
      setNotification(
        NOTIFICATION_MAP_INTERNAL_BALANCES[TransactionStatus.CONFIRMED]
      );
    },
    onError() {
      setNotification(
        NOTIFICATION_MAP_INTERNAL_BALANCES[TransactionStatus.WRITE_ERROR]
      );
    },
  });

  const handleNotifier = () => {
    if (isNotifierOpen) {
      setIsNotifierOpen(false);
      setTimeout(() => {
        setIsNotifierOpen(true);
      }, 100);
    } else {
      setIsNotifierOpen(true);
    }
  };

  useEffect(() => {
    if (!notification) return;
    handleNotifier();
  }, [notification]);

  return {
    isNotifierOpen,
    setIsNotifierOpen,
    operationKind,
    handleWithdraw,
    notification,
    transactionUrl,
  };
}
