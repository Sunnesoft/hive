import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { cratesUsed, sourcesIn } from '../src/deps.ts';

test('the crates Rust code takes from outside: roots of its use paths, not the language\'s or its own modules', () => {
  const pages = [
    { url: 'https://x/src/core.rs', text: 'use near_contract_standards::{\n  fungible_token::core::FungibleTokenCore,\n};\nuse near_sdk::{env, AccountId};\nuse crate::Contract;\nuse std::fmt;\nmod defer;\n' },
    { url: 'https://x/src/lib.rs', text: 'pub use ::serde::Serialize;\nuse defer::Batch;\nextern crate alloc;\n' },
  ];
  assert.deepEqual(cratesUsed(pages).sort(), ['near_contract_standards', 'near_sdk', 'serde']);
});

test('a .crate archive gives its Rust sources by their path inside the crate', () => {
  const entry = (name: string, body: string) => {
    const head = Buffer.alloc(512);
    head.write(name, 0);
    head.write(body.length.toString(8).padStart(11, '0'), 124);
    head.write('0', 156);
    const data = Buffer.alloc(Math.ceil(body.length / 512) * 512);
    data.write(body, 0);
    return Buffer.concat([head, data]);
  };
  const tar = Buffer.concat([entry('lib-1.0.0/src/lib.rs', 'pub fn f() {}'), entry('lib-1.0.0/Cargo.toml', '[package]'), Buffer.alloc(1024)]);
  const files = sourcesIn(gzipSync(tar));
  assert.deepEqual([...files.keys()], ['src/lib.rs']);
  assert.equal(files.get('src/lib.rs'), 'pub fn f() {}');
});

test('a file a step asks for is found in the words around its address', async () => {
  const { needed } = await import('../src/deps.ts');
  // no network in tests: an address nothing answers at is skipped, and nothing is asked for twice
  const pages = await needed(['near-sdk-macros source (docs.rs/crate/no-such-crate-xyz/latest/source/src/lib.rs) to confirm', 'nothing here'], 100_000);
  assert.deepEqual(pages, []);
});
