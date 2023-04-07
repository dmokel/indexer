import * as Sdk from "@reservoir0x/sdk";
import { BaseBuildParams } from "@reservoir0x/sdk/dist/looks-rare-v2/builders/base";

import { redb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";

export interface BaseOrderBuildOptions {
  maker: string;
  contract?: string;
  weiPrice: string;
  listingTime?: number;
  expirationTime?: number;
}

type OrderBuildInfo = {
  params: BaseBuildParams;
};

export const getBuildInfo = async (
  options: BaseOrderBuildOptions,
  collection: string,
  side: "sell" | "buy"
): Promise<OrderBuildInfo> => {
  const collectionResult = await redb.oneOrNone(
    `
      SELECT
        contracts.address,
        contracts.kind
      FROM collections
      JOIN contracts
        ON collections.contract = contracts.address
      WHERE collections.id = $/collection/
      LIMIT 1
    `,
    { collection }
  );
  if (!collectionResult) {
    // Skip if we cannot retrieve the collection
    throw new Error("Could not fetch token collection");
  }

  const buildParams: BaseBuildParams = {
    quoteType:
      side === "sell" ? Sdk.LooksRareV2.Types.QuoteType.Ask : Sdk.LooksRareV2.Types.QuoteType.Bid,
    collection: fromBuffer(collectionResult.address),
    collectionType:
      collectionResult.kind === "erc721"
        ? Sdk.LooksRareV2.Types.CollectionType.ERC721
        : Sdk.LooksRareV2.Types.CollectionType.ERC1155,
    signer: options.maker,
    price: options.weiPrice,
    itemId: "0",
    amount: 1,
    currency: Sdk.Common.Addresses.Weth[config.chainId],
    startTime: options.listingTime!,
    endTime: options.expirationTime!,
  };

  return {
    params: buildParams,
  };
};
