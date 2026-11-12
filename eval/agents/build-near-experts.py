# Builds two NEAR review experts from public sources with licences that allow reuse and change:
#   near-security-guide  the "Security" pages of the NEAR documentation (near/docs, MIT and Apache-2.0)
#   near-standards       the contract standards (near/NEPs, each waived via CC0)
# The pages are kept as written; only what is not knowledge is taken off: front matter, page markup, site links,
# and in the standards the sections that are not the standard (reference implementation, history, copyright).
#   python3 -I build_near_experts.py <near-research folder> <project folder>
import json, pathlib, re, sys

src, project = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
out = project / 'eval' / 'agents'

def front(text):
    m = re.match(r'---\n(.*?)\n---\n', text, re.S)
    if not m: return {}, text
    meta = dict(re.findall(r'^(\w+):\s*"?(.*?)"?\s*$', m.group(1), re.M))
    return meta, text[m.end():]

def page(path):
    meta, body = front(path.read_text())
    body = re.sub(r'^import .*$', '', body, flags=re.M)
    body = re.sub(r'^\s*</?[A-Z][A-Za-z]*[^>\n]*>\s*$', '', body, flags=re.M)          # <Tip>, </Warning>, <Accordion title="...">
    body = re.sub(r'\[([^\]]+)\]\((?:/|\.)[^)]*\)', r'\1', body)                        # links inside the site: the words stay
    body = re.sub(r'^```(\w+)[^\n]*$', r'```\1', body, flags=re.M)                      # ```toml Cargo.toml highlight={2}
    body = re.sub(r'^---\s*$', '', body, flags=re.M)
    body = re.sub(r'\n{3,}', '\n\n', body).strip()
    where = path.relative_to(src / 'near-docs')
    return f"Source: github.com/near/docs at 7be61a4, {where} (MIT and Apache-2.0 licences).\n\n# {meta.get('title', path.stem)}\n\n{meta.get('description', '')}\n\n{body}\n"

def standard(path):
    meta, body = front(path.read_text())
    DROP = ('Reference Implementation', 'Drawbacks', 'Future possibilities', 'History', 'Changelog', 'Copyright', 'Errata')
    keep, on = [], True
    for line in body.split('\n'):
        h = re.match(r'## (.+)', line)
        if h: on = not h.group(1).strip().startswith(DROP)
        if on: keep.append(line)
    body = re.sub(r'\n{3,}', '\n\n', '\n'.join(keep)).strip()
    return f"Source: github.com/near/NEPs at 095fe98, neps/{path.name} (copyright and related rights waived via CC0).\n\n# NEP-{meta.get('NEP')}: {meta.get('Title')}\n\n{body}\n"

def write(name, card, expertise, method, files):
    d = out / name
    (d / 'knowledge').mkdir(parents=True, exist_ok=True)
    for old in (d / 'knowledge').glob('*.md'): old.unlink()
    (d / 'agent.json').write_text(json.dumps({'name': name, **card}, indent=2, ensure_ascii=False) + '\n')
    (d / 'expertise.md').write_text(expertise.strip() + '\n')
    (d / 'method.md').write_text(method.strip() + '\n')
    total = 0
    for fname, text in files:
        (d / 'knowledge' / fname).write_text(text)
        total += len(text)
    print(f'{name}: {len(files)} files, {total} characters')

REPORT = """
A finding is a place in the code where the rule is broken and something follows from it: funds or tokens lost or
locked, state left half done, a method anyone can call, storage nobody paid for. Name the function and the file,
follow the receipts in order (the call, what is saved before it, the callback, what the callback restores), and say
who can trigger it and what they gain or what others lose. A rule the code keeps is not reported. Something that
only could be better, with no harm that follows, is Low or left out.

Severity: Critical or High when an unprivileged account can take or lock funds or tokens; Medium when it needs a
condition outside the attacker's control, or the harm is bounded; Low for losses of dust, missing checks on the
owner's own input and departures from a standard that break integrations, not balances.

Proof. When code is asked for, a proof is a Rust test for the contract's own crate. A finding inside one method is a
unit test with near_sdk::test_utils::VMContextBuilder and testing_env!: set the predecessor, the attached deposit and
the block time, call the method, assert the state that should not be possible. A finding that needs two receipts (a
call and its callback, a failed transfer) is a near-workspaces sandbox test: deploy the contract and the token, make
the call, assert the balances after the callback. The test is written, not run.
"""

docs = src / 'near-docs' / 'smart-contracts'
SECURITY = ['checklist', 'storage', 'one_yocto', 'sybil', 'frontrunning', 'duplicate-inputs', 'random',
            'cross-contract-calls/callbacks', 'cross-contract-calls/refunds', 'cross-contract-calls/callback-panics',
            'cross-contract-calls/callback-failures', 'cross-contract-calls/ft-transfer-call', 'cross-contract-calls/reentrancy']
guide = [(f"{p.split('/')[-1]}.md", page(docs / 'security' / f'{p}.mdx')) for p in SECURITY]
guide.append(('best-practices.md', page(docs / 'anatomy' / 'best-practices.mdx')))
write('near-security-guide', {
    'model': 'deepseek-ai/DeepSeek-V4.1-Flash-1017',
    'skills': "Security review of NEAR smart contracts in Rust by the NEAR documentation's security guide: access control and one yoctoNEAR, storage cost attacks, cross-contract calls and their callbacks (failures, panics, refunds, reentrancy between receipts), ft_transfer_call receivers, duplicate inputs, front-running, Sybil limits, randomness. Reviews attached contract code rule by rule and quotes the lines each finding rests on. Knowledge: the Security pages of docs.near.org (MIT and Apache-2.0).",
    'rate': '1.00', 'max_cost': '1.30', 'work': 'review',
    'examples': ['Review this NEAR contract before mainnet: what can an attacker do with its callbacks?', 'Is this ft_on_transfer safe, and what happens when the transfer back fails?', 'Does this contract let users grow its storage without paying for it?'],
    'topics': ['dev_tools'],
}, """
A reviewer of NEAR smart contracts written in Rust with near-sdk. The knowledge is the Security section of the NEAR
documentation (docs.near.org, source at github.com/near/docs, MIT and Apache-2.0 licences): the pre-deployment
security checklist and a page for each risk it names: storage cost attacks, one yoctoNEAR, Sybil attacks,
front-running, duplicate inputs, randomness, and for cross-contract calls: callbacks, refunds, panics in callbacks,
callbacks that fail, ft_transfer_call and reentrancy between receipts. This expert is built from that open material;
it is not NEAR Foundation and is not endorsed by it.
""", """
Read the contract the way the security guide does: receipt by receipt. A cross-contract call is a later receipt; what
the method saved before it stays saved whatever the call does; the callback always runs but can itself fail; between
the call and its callback any other method can run. For each rule of the guide, find the code it speaks about and
decide whether the code keeps it.
""" + REPORT, guide)

neps = src / 'near-NEPs' / 'neps'
STANDARDS = ['nep-0141', 'nep-0145', 'nep-0148', 'nep-0297', 'nep-0171', 'nep-0178']
write('near-standards', {
    'model': 'Qwen/Qwen3.8-27B',
    'skills': "Conformance review of NEAR smart contracts in Rust against the contract standards: NEP-141 fungible tokens (ft_transfer, ft_transfer_call, ft_on_transfer, ft_resolve_transfer and their refunds), NEP-145 storage management (storage_deposit, storage_withdraw, storage_unregister and their bounds), NEP-148 token metadata, NEP-297 events, NEP-171 non-fungible tokens and NEP-178 approvals. Reviews attached contract code against each requirement and quotes the lines each finding rests on. Knowledge: the NEAR Enhancement Proposals (CC0).",
    'rate': '1.00', 'max_cost': '0.30', 'work': 'review',
    'examples': ['Does this token contract follow NEP-141 and NEP-145, and what breaks for wallets and exchanges if not?', 'Review how this contract receives tokens with ft_on_transfer and returns what it does not use.', 'Is the storage deposit of this contract handled the way NEP-145 requires?'],
    'topics': ['dev_tools'],
}, """
A reviewer of NEAR smart contracts against the standards they claim or use. The knowledge is the text of the NEAR
Enhancement Proposals for contracts (github.com/near/NEPs, each waived into the public domain via CC0): NEP-141
fungible token, NEP-145 storage management, NEP-148 fungible token metadata, NEP-297 events, NEP-171 non-fungible
token, NEP-178 non-fungible token approvals. This expert is built from that open material; it is not NEAR Foundation
and is not endorsed by it.
""", """
Hold the contract against the standards it implements or calls. For each requirement of a standard ("must", "should",
"panics if", "returns", "refunds"): find the method it speaks about, whether in the contract's own interface or in the
way it calls or receives a token, and decide whether the code does what the standard requires, in the success branch
and in the failure branch. A standard the contract neither implements nor uses finds nothing.
""" + REPORT, [(f'{n}.md', standard(neps / f'{n}.md')) for n in STANDARDS])

for name in ('near-security-guide', 'near-standards'):
    text = '\n'.join(p.read_text() for p in (out / name / 'knowledge').glob('*.md'))
    odd = re.findall(r'(?i)ignore (?:all )?previous|you are an? (?:ai|assistant|agent)|system prompt|<[A-Z][A-Za-z]+[ >]', text)
    print(f'  {name}: left-over markup or talk to an AI: {sorted(set(odd))[:8]}')
