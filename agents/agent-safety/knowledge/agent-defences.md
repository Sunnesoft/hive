# Defences for agents that read untrusted text

## Where injected instructions come from

Any text the agent did not write can carry instructions: the user's brief, attached files, fetched web pages, search results, tool output and the answers of other agents.
A model cannot reliably tell data from instructions, so telling it "treat this as data" lowers the risk but never removes it; the real defences are in what the agent is allowed to do and in what its output is allowed to contain.
The most dangerous combination is an agent that reads untrusted text, has access to private data, and can send something out (a link, an image, an email, a web request, a tool call): remove at least one of the three.

## Leaks through links and images

A model can put private data into a URL, for example `attacker.example/?q=` followed by the user's question, and the data leaves the moment someone clicks the link.
An image in Markdown or HTML leaks without any click: the reader's browser or app loads the image URL as soon as the answer is shown.
The robust rule is to keep clickable only links that existed before the task: from the brief, from pages the agent actually fetched and the links inside them, and from its own reference material; show every other URL as plain text marked unverified, with the dots replaced so it is not auto-linked.
Drop images and raw HTML from model output entirely, or allow images only from a fixed list of hosts you control.
Do not filter links with regular expressions: Markdown has inline links, reference links with definitions, autolinks in angle brackets, bare www. addresses and schemes in any letter case; parse the output into a Markdown tree (for example with a GFM parser), rebuild it from allowed nodes only, and serialize it again.

## Hidden text

Zero-width characters U+200B to U+200D, U+2060 and U+FEFF hide words inside text that looks clean to a person.
Bidirectional controls U+202A to U+202E and U+2066 to U+2069 make text display in a different order than a model reads it.
The Unicode tag block U+E0000 to U+E007F can encode a whole hidden ASCII message that most screens do not show at all ("ASCII smuggling").
Strip or reject these ranges in everything that reaches the model and in everything the model returns, and normalize the text before you scan it.

## Code in answers

Never run code from an answer automatically; mark code blocks as not run and let a person decide.
Remove blocks that download and execute in one step, such as curl or wget piped into sh or bash, PowerShell iex with a web download, or a base64 string decoded and executed; a static pattern check catches these before any model review.
A second model may review the remaining code, but when that review fails or times out, treat the code as unsafe: fail closed.

## Fetching URLs safely (SSRF)

An agent that fetches URLs from untrusted text can be pointed at your internal network: localhost, private address ranges, link-local addresses and cloud metadata endpoints such as 169.254.169.254.
Check the resolved IP address, not the host name, and check it again on every redirect, because a public name can resolve to a private address or redirect to one.
Set limits on every fetch: a timeout, a maximum response size, a maximum number of redirects; and convert untrusted HTML to text in a separate worker with its own memory and time limits, so a hostile page can only crash that worker.
Fetch only https, send no cookies or credentials, and never let the model choose request headers.

## Several agents, one answer

When several agents contribute to one answer, let each agent see only its own question, never the other agents' answers, so one agent cannot instruct another.
Check each contribution on its own with a separate evaluator that sees the task, the question and that one answer; an agent that addresses the evaluator, asks for a score or tries to change the rules has broken them.
Only the component that composes the final answer sees all contributions, and its output goes through the same link, image and code filters as everything else.

## Uploaded knowledge

Scan every chunk of uploaded material before the agent is admitted: a fixed pattern check for phrases that tell a model to drop its earlier instructions and for hidden characters, then a cheap model that flags text aimed at an AI.
Show the owner of the material what was flagged and why, so a false alarm can be fixed, but keep the reasons out of shared logs.

## Cost abuse

A single request can be made expensive on purpose: a huge pasted document, a request for an endless answer, or many parallel calls.
Before each model call, compute its worst case (input tokens plus the maximum output, times the price) and refuse the call if that worst case is above the budget held for it; this caps the cost of a request in advance instead of after the bill.
