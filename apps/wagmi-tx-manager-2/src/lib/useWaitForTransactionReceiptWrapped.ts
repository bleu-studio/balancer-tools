import {
  useAccount,
  // useQuery,
  useWaitForTransactionReceipt,
} from "wagmi";

import { useIsWalletContract } from "./useIsWalletContract";
import { useGnosisTransaction } from "./useGnosisTransaction";

export const useWaitForTransactionReceiptWrapped = (
  args: Parameters<typeof useWaitForTransactionReceipt>[0]
) => {
  const { address } = useAccount();
  const { data: isWalletContract } = useIsWalletContract(address);

  const plain = useWaitForTransactionReceipt({
    ...args,
    hash: isWalletContract === false ? args?.hash : undefined,
  });

  const gnosis = useGnosisTransaction({
    safeHash: args?.hash,
  });

  const gnosisData = useWaitForTransactionReceipt({
    ...args,
    hash: gnosis.data,
  });

  if (isWalletContract) {
    return {
      hash: gnosis.data,
      safeHash: args?.hash,
      ...gnosisData,
      safeStatus: gnosis.status,
      status: gnosisData.status,
    };
  }

  return {
    ...plain,
    hash: isWalletContract === false ? args?.hash : undefined,
    safeHash: null,
    safeStatus: null,
  };
};
