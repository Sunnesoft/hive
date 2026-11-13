# DeFi cases: NFT markets and NFT series sales

What audits of NEAR NFT marketplaces (fixed-price sales, offers, auctions) and of NFT contracts that sell series of copies report about prices, fees, royalties and payouts.

## Buyer's overpayment kept (seen in two reports)
- **Look for:** `buy` on a fixed-price listing that requires `attached_deposit >= price` and then settles with `price`; a fee the caller estimates himself and attaches. Is the difference sent back?
- **What goes wrong:** whatever was attached above the price or the fee stays in the contract's balance, attributed to nobody; only the owner, with the contract's key, could return it.
- **Usually rated:** Medium for a purchase; a note for an estimated fee.
- **Not a finding when:** the method demands the exact amount or refunds the excess in the same call.

## Market fee larger than what is left for the seller (seen once)
- **Look for:** settlement in the callback after `nft_transfer_payout`: the payout map gives royalties and the seller's part, summing to the price; the treasury fee, computed from the whole price, is then subtracted from the seller's part alone.
- **What goes wrong:** with high royalties the seller's part is smaller than the fee and the subtraction underflows. The callback panics after the NFT has moved, and the buyer's payment stays in the contract with no record.
- **Usually rated:** Medium.
- **Not a finding when:** the fee is capped by the seller's part, or royalties plus fee are bounded when the listing is created.

## Listing removed before the sale is known to have worked (seen once)
- **Look for:** purchase code that deletes the listing record, then calls the NFT contract, and in the failure branch of its callback does not put the listing back.
- **What goes wrong:** one failed purchase, for instance with an approval that is no longer valid, removes the item from sale; the seller must list again.
- **Usually rated:** Low; the team called it intended, since a failed transfer usually means the approval is gone.

## Sale and auction sharing one record (seen once)
- **Look for:** one listing struct with an `is_auction` option and start and end times. Check the three states of the option (absent, false, true) in `buy`, in listing creation and in bidding: an end time demanded for plain sales; `buy` accepting only an absent flag and refusing `false`.
- **What goes wrong:** a correctly created sale cannot be bought, or a seller's listing request is refused for a missing end time a sale does not need.
- **Usually rated:** Low.

## Seller withdraws an auction that already has a winner (seen once)
- **Look for:** the method that deletes a listing: for auctions, is it refused once bids exist or the end time has passed?
- **What goes wrong:** the seller watches the bidding and cancels when the result displeases him; bidders had their funds committed for nothing.
- **Usually rated:** a note; teams answer that the seller could revoke the approval anyway.

## Fee rate fixed when the price was set (seen once)
- **Look for:** a per-listing or per-series copy of the market's fee rate, written when the seller sets the price and never refreshed, while the owner can change the global rate; a view that returns no fee for a series although one is stored.
- **What goes wrong:** after a fee change old listings still settle at the old rate, to the treasury's or the buyer's cost; front ends show a different fee from the one charged.
- **Usually rated:** Low, usually accepted as designed.

## Series shown for sale that cannot be minted (seen once)
- **Look for:** the two places where a series can run out of copies: minting the last one, and the creator lowering the number of copies. Does each clear the price, or mark the series closed?
- **What goes wrong:** a series keeps a price although no copy can be minted; buyers' purchases fail.
- **Usually rated:** Low.

## Burn that does not free the copy (seen once)
- **Look for:** `nft_burn` in a series contract: is the token id removed from the series' set, and how is the next token id derived (from the size of that set)?
- **What goes wrong:** burnt copies still count against the edition limit and cannot be minted again; a fix that shrinks the set must also change how ids are made, or a new mint reuses a live id.
- **Usually rated:** Low; the team may state that supply is meant to include burnt tokens.

## Creator mints around the market fee (seen once)
- **Look for:** a direct mint method open to the series creator, with a receiver argument, beside the paid `buy` path that charges the market fee.
- **What goes wrong:** creator and buyer settle the price off chain and the creator mints straight to the buyer; the treasury gets nothing from that sale.
- **Usually rated:** Low, accepted as designed.

## Payout that the token's owner dictates (seen once)
- **Look for:** an NFT contract whose `nft_transfer_payout` builds the payout from a `balance` argument the caller sets, callable by the token's owner, where no market contract stands in between.
- **What goes wrong:** any consumer of the payout, a market contract or an off-chain listener, pays out according to numbers the seller chose.
- **Usually rated:** Medium.

## Collected fees with no way out (seen in several reports)
- **Look for:** mint fees, sale fees or bridge fees accumulated in the contract's balance or in a counter: is there a method that pays them to the treasury, and to whom does its transfer go? Would the team rely on a full-access key for it?
- **What goes wrong:** once the contract is under a DAO with no key, the fees are locked; a withdrawal addressed to the contract itself moves nothing.
- **Usually rated:** Medium; High where the withdrawal exists and cannot work.

## Recurring recommendations (seen in two reports)
- **Look for:** a whitelist that admits NFT contracts lacking the payout method the market calls on every sale; the minimum raise of a bid computed with division before multiplication; refunds of replaced offers paid from the contract's balance with no check that it suffices; any collection accepted by a bridge or market.
- **What goes wrong:** every purchase from such a collection fails; small bids pass the increment rule; a refund fails in a later block with nothing rolled back.
- **Usually rated:** recommendations and Low; Medium for the failing refund.
