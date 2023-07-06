import { Interface } from "@ethersproject/abi";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import axios from "axios";

import { idb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { bn, now, toBuffer } from "@/common/utils";
import { CollectionMint, CollectionMintStatus } from "@/orderbook/mints";

export const toSafeTimestamp = (value: BigNumberish) =>
  bn(value).gte(9999999999) ? undefined : bn(value).toNumber();

export const fetchMetadata = async (url: string) => {
  if (url.startsWith("ipfs://")) {
    url = `https://ipfs.io/ipfs/${url.slice(7)}`;
  }

  return axios.get(url).then((response) => response.data);
};

export const getMaxSupply = async (contract: string): Promise<string | undefined> => {
  let maxSupply: string | undefined;
  try {
    const c = new Contract(
      contract,
      new Interface([
        "function maxSupply() view returns (uint256)",
        "function MAX_SUPPLY() view returns (uint256)",
      ]),
      baseProvider
    );

    if (!maxSupply) {
      maxSupply = await c
        .maxSupply()
        .then((t: BigNumber) => t.toString())
        .catch(() => undefined);
    }
    if (!maxSupply) {
      maxSupply = await c
        .MAX_SUPPLY()
        .then((t: BigNumber) => t.toString())
        .catch(() => undefined);
    }
  } catch {
    // Skip errors
  }

  return maxSupply;
};

export const getAmountMinted = async (
  collectionMint: CollectionMint,
  user: string
): Promise<BigNumber> => {
  let amountMinted: string;
  if (collectionMint.tokenId) {
    amountMinted = await idb
      .one(
        `
          SELECT
            coalesce(sum(nft_transfer_events.amount), 0) AS amount_minted
          FROM nft_transfer_events
          WHERE nft_transfer_events.address = $/contract/
            AND nft_transfer_events.token_id = $/tokenId/
            AND nft_transfer_events.is_deleted = 0
            AND nft_transfer_events."from" = $/from/
            AND nft_transfer_events."to" = $/to/
        `,
        {
          contract: toBuffer(collectionMint.contract),
          tokenId: collectionMint.tokenId,
          from: toBuffer(AddressZero),
          to: toBuffer(user),
        }
      )
      .then((r) => r.amount_minted);
  } else {
    amountMinted = await idb
      .one(
        `
          SELECT
            coalesce(sum(nft_transfer_events.amount), 0) AS amount_minted
          FROM nft_transfer_events
          WHERE nft_transfer_events.address = $/contract/
            AND nft_transfer_events.is_deleted = 0
            AND nft_transfer_events."from" = $/from/
            AND nft_transfer_events."to" = $/to/
        `,
        {
          contract: toBuffer(collectionMint.contract),
          from: toBuffer(AddressZero),
          to: toBuffer(user),
        }
      )
      .then((r) => r.amount_minted);
  }

  return bn(amountMinted);
};

export const getCurrentSupply = async (collectionMint: CollectionMint): Promise<BigNumber> => {
  let tokenCount: string;
  if (collectionMint.tokenId) {
    tokenCount = await idb
      .one(
        `
          SELECT
            coalesce(sum(nft_balances.amount), 0) AS token_count
          FROM nft_balances
          WHERE nft_balances.contract = $/contract/
            AND nft_balances.token_id = $/tokenId/
            AND nft_balances.amount > 0
        `,
        {
          contract: toBuffer(collectionMint.contract),
          tokenId: collectionMint.tokenId,
        }
      )
      .then((r) => r.token_count);
  } else {
    tokenCount = await idb
      .one(
        `
          SELECT
            collections.token_count
          FROM collections
          WHERE collections.id = $/collection/
        `,
        {
          collection: collectionMint.collection,
        }
      )
      .then((r) => r.token_count);
  }

  return bn(tokenCount);
};

export const getStatus = async (collectionMint: CollectionMint): Promise<CollectionMintStatus> => {
  // Check start and end time
  const currentTime = now();
  if (collectionMint.startTime && currentTime <= collectionMint.startTime) {
    return "closed";
  }
  if (collectionMint.endTime && currentTime >= collectionMint.endTime) {
    return "closed";
  }

  // Check maximum supply
  if (collectionMint.maxSupply) {
    const currentSupply = await getCurrentSupply(collectionMint);
    if (bn(collectionMint.maxSupply).lte(currentSupply)) {
      return "closed";
    }
  }

  return "open";
};
