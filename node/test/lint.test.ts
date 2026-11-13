import assert from 'node:assert/strict';
import test from 'node:test';
import { lint } from '../src/lint.ts';

const contract = `
#[near_bindgen]
impl Contract {
    pub fn withdraw_minter(&mut self) {
        assert_one_yocto();
        self.minters.remove(&env::predecessor_account_id());
    }

    #[payable]
    pub fn burn(&mut self) {
        assert_one_yocto();
    }

    pub fn set_min_deposit(&mut self, min_deposit: u128) {
        self.min_deposit = min_deposit;
    }

    pub fn set_end_ms(&mut self, end_ms: u64) {
        self.end_ms = end_ms;
    }

    #[private] // only the contract calls it
    pub fn sybil_callback(&mut self, deposit: Balance) -> Promise {
        let caller_id = env::predecessor_account_id();
        Promise::new(caller_id).transfer(deposit)
    }

    #[private]
    pub fn transfer_payout_callback(&mut self, mut payout: Payout) {
        payout.paid_at = Some(env::block_timestamp_ms());
    }
}
`;

test('the NEAR linter: what code can find with no model, each on its line', () => {
  const found = lint([{ url: 'https://example.com/src/lib.rs', text: contract }]);
  const titles = found.map((f) => f.title).join('\n');
  assert.match(titles, /withdraw_minter asserts one yoctoNEAR but is not #\[payable\]/);
  assert.doesNotMatch(titles, /^burn asserts/m); // payable: one yocto can be attached
  assert.match(titles, /set_min_deposit takes min_deposit as a u128/);
  assert.doesNotMatch(titles, /set_end_ms/); // a time in u64 fits JSON
  assert.match(titles, /sybil_callback takes predecessor_account_id\(\) as the user/);
  assert.match(titles, /transfer_payout_callback marks the work done only in the callback/);
  assert.ok(found.every((f) => f.evidence.startsWith('`') && contract.includes(f.evidence.split('\n')[0]!.slice(1, -1))), 'every finding quotes a line of the file');
});
