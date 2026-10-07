/**
 * Hand-written chat markdown parser (the kv chat subset): a pure character
 * scanner — string in, block AST out; no DOM, no RegExp in the parse path
 * (code-point predicates and char-class tables only — the user's 2026-10
 * ruling after live-testing marked).
 *
 * Why hand-written, per the three live failures that die by construction
 * here: the old escape-then-parse pipeline leaked HTML entities into fenced
 * code (text is now emitted verbatim and made inert by the renderer's
 * textContent contract); marked's CommonMark flanking rules reject
 * CJK-punctuation adjacency (，**重点**。 refused to emphasize — adjacency
 * here disqualifies on whitespace ONLY, so fullwidth punctuation flanks
 * count); and list markers vanished in the chat stylesheet (the renderer
 * now emits explicit marker spans).
 *
 * Grammar: fences (```/~~~) with a language word, ATX headings, thematic
 * breaks, blockquotes (recursive), lists (nesting + lazy continuation,
 * explicit numbering), GFM tables (alignment colons, edge pipes optional),
 * paragraphs with soft breaks. Inline: strong/em with lenient delimiters
 * (snake_case protected for _), verbatim code spans, del, links + bare-URL
 * autolinks (link text parses no further links — nested syntax degrades to
 * literal text, so a link is always exactly one anchor), backslash escapes.
 * Raw HTML is not a grammar — it can only ever end up inside text nodes.
 *
 * //! 移植自 kv-unix src/shared/chat 2026-10-05, 上游修复需手动同步; 逻辑逐字保留禁改.
 */

//region AST types
/** Cell alignment derived from the separator row's colons (null = default). */
export type MdAlign = "left" | "center" | "right";

export interface MdText
{
    kind: "text";
    text: string;
}

export interface MdSoftBreak
{
    kind: "softBreak";
}

export interface MdStrong
{
    kind: "strong";
    children: MdInline[];
}

export interface MdEm
{
    kind: "em";
    children: MdInline[];
}

export interface MdDel
{
    kind: "del";
    children: MdInline[];
}

export interface MdCodeSpan
{
    kind: "code";
    text: string;
}

export interface MdLink
{
    kind: "link";
    href: string;
    children: MdInline[];
}

export type MdInline = MdText | MdSoftBreak | MdStrong | MdEm | MdDel | MdCodeSpan | MdLink;

export interface MdListItem
{
    blocks: MdBlock[];
}

export interface MdParagraph
{
    kind: "paragraph";
    inlines: MdInline[];
}

export interface MdHeading
{
    kind: "heading";
    level: number;
    inlines: MdInline[];
}

export interface MdCodeBlock
{
    kind: "code";
    language: string;
    text: string;
}

export interface MdThematicBreak
{
    kind: "thematicBreak";
}

export interface MdQuote
{
    kind: "quote";
    blocks: MdBlock[];
}

export interface MdList
{
    kind: "list";
    ordered: boolean;
    start: number;
    items: MdListItem[];
}

export interface MdTable
{
    kind: "table";
    aligns: Array<MdAlign | null>;
    header: MdInline[][];
    rows: MdInline[][][];
}

export type MdBlock = MdParagraph | MdHeading | MdCodeBlock | MdThematicBreak | MdQuote | MdList | MdTable;
//endregion

//region Character predicates (code-point checks only — no RegExp by ruling)
const CODE_BACKSLASH = 92;
const CODE_BACKTICK = 96;
const CODE_TILDE = 126;
const CODE_UNDERSCORE = 95;
const CODE_ASTERISK = 42;
const CODE_HASH = 35;
const CODE_GT = 62;
const CODE_PIPE = 124;
const CODE_LF = 10;
const CODE_SPACE = 32;
const CODE_TAB = 9;
const CODE_COLON = 58;
const CODE_DASH = 45;
const CODE_LPAREN = 40;
const CODE_RPAREN = 41;
const CODE_LBRACKET = 91;
const CODE_RBRACKET = 93;

/**
 * EOF/BOF stand-in: reads as whitespace so emphasis can never open at the
 * very end nor close at the very start of an inline run.
 */
const EDGE = CODE_LF;

const isWhitespaceCode = (code: number): boolean => code <= CODE_SPACE;

const isSpaceOrTab = (code: number): boolean => code === CODE_SPACE || code === CODE_TAB;

const isAsciiDigit = (code: number): boolean => code >= 48 && code <= 57;

const isAsciiLetter = (code: number): boolean => (code >= 65 && code <= 90) || (code >= 97 && code <= 122);

const isAsciiWordChar = (code: number): boolean => isAsciiLetter(code) || isAsciiDigit(code) || code === CODE_UNDERSCORE;

/** ASCII punctuation is the only escapable class (33–126 minus alphanumerics). */
const isEscapablePunct = (code: number): boolean => code > CODE_SPACE && code < 127 && !isAsciiLetter(code) && !isAsciiDigit(code);

/** charAt beyond either end yields NaN; callers wanting edge behavior use charAtOrEdge. */
const charAtOrEdge = (text: string, index: number): number =>
    index >= 0 && index < text.length ? text.charCodeAt(index) : EDGE;

const runLength = (text: string, start: number, code: number): number =>
{
    let length = 0;
    while(text.charCodeAt(start + length) === code)
        length += 1;
    return length;
};

const repeatCode = (code: number, count: number): string => String.fromCharCode(code).repeat(count);
//endregion

//region Line-level predicates
const leadingSpaces = (line: string): number =>
{
    let count = 0;
    while(line.charCodeAt(count) === CODE_SPACE)
        count += 1;
    return count;
};

const isBlank = (line: string): boolean =>
{
    for(let index = 0; index < line.length; index += 1)
        if(!isWhitespaceCode(line.charCodeAt(index)))
            return false;
    return true;
};

/** Splits on \n and \r\n; a trailing terminator does not produce an empty line. */
const splitLines = (source: string): string[] =>
{
    const lines: string[] = [];
    let start = 0;
    for(let index = 0; index < source.length; index += 1)
    {
        const code = source.charCodeAt(index);
        if(code !== CODE_LF && code !== 13)
            continue;
        lines.push(source.slice(start, index));
        if(code === 13 && source.charCodeAt(index + 1) === CODE_LF)
            index += 1;
        start = index + 1;
    }
    if(start < source.length)
        lines.push(source.slice(start));
    return lines;
};

interface FenceInfo
{
    indent: number;
    code: number;
    length: number;
    language: string;
}

const sanitizeLanguage = (info: string): string =>
{
    let word = "";
    for(let index = 0; index < info.length; index += 1)
    {
        const code = info.charCodeAt(index);
        if(isWhitespaceCode(code))
            break;
        const allowed = isAsciiLetter(code) || isAsciiDigit(code)
            || code === 43 || code === CODE_HASH || code === 46 || code === CODE_DASH;
        if(!allowed)
            break;
        word += String.fromCharCode(code);
    }
    return word;
};

const fenceOf = (line: string): FenceInfo | null =>
{
    const indent = leadingSpaces(line);
    if(indent > 3)
        return null;
    const code = line.charCodeAt(indent);
    if(code !== CODE_BACKTICK && code !== CODE_TILDE)
        return null;
    const length = runLength(line, indent, code);
    if(length < 3)
        return null;
    const info = line.slice(indent + length).trim();
    // A backtick fence's info string may not contain backticks (CommonMark).
    if(code === CODE_BACKTICK && info.indexOf(String.fromCharCode(CODE_BACKTICK)) !== -1)
        return null;
    return {indent, code, length, language: sanitizeLanguage(info)};
};

const isClosingFence = (line: string, fence: FenceInfo): boolean =>
{
    const indent = leadingSpaces(line);
    if(indent > 3)
        return false;
    if(runLength(line, indent, fence.code) < fence.length)
        return false;
    return isBlank(line.slice(indent + runLength(line, indent, fence.code)));
};

const stripIndent = (line: string, indent: number): string =>
{
    let removed = 0;
    while(removed < indent && line.charCodeAt(removed) === CODE_SPACE)
        removed += 1;
    return line.slice(removed);
};

interface HeadingInfo
{
    level: number;
    content: string;
}

const headingOf = (line: string): HeadingInfo | null =>
{
    const indent = leadingSpaces(line);
    if(indent > 3)
        return null;
    const level = runLength(line, indent, CODE_HASH);
    if(level < 1 || level > 6)
        return null;
    const after = charAtOrEdge(line, indent + level);
    if(after !== EDGE && !isSpaceOrTab(after))
        return null;
    let content = line.slice(indent + level).trim();
    // A closing # sequence only counts when a space precedes it (# C# keeps its hash).
    if(content.length > 1)
    {
        let end = content.length;
        while(end > 0 && content.charCodeAt(end - 1) === CODE_HASH)
            end -= 1;
        if(end > 0 && end < content.length && isSpaceOrTab(content.charCodeAt(end - 1)))
            content = content.slice(0, end).trimEnd();
    }
    return {level, content};
};

const isThematicBreak = (line: string): boolean =>
{
    const indent = leadingSpaces(line);
    if(indent > 3)
        return false;
    const code = line.charCodeAt(indent);
    if(code !== CODE_DASH && code !== CODE_ASTERISK && code !== CODE_UNDERSCORE)
        return false;
    let count = 0;
    for(let index = indent; index < line.length; index += 1)
    {
        const current = line.charCodeAt(index);
        if(current === code)
        {
            count += 1;
            continue;
        }
        if(!isSpaceOrTab(current))
            return false;
    }
    return count >= 3;
};

const quotePrefixAt = (line: string): boolean =>
    leadingSpaces(line) <= 3 && line.charCodeAt(leadingSpaces(line)) === CODE_GT;

/** Strips one ">" plus a single optional following space. */
const quoteContent = (line: string): string =>
{
    let index = leadingSpaces(line) + 1;
    if(isSpaceOrTab(line.charCodeAt(index)))
        index += 1;
    return line.slice(index);
};

interface ListMarker
{
    ordered: boolean;
    start: number;
    indent: number;
    contentStart: number;
}

const listMarkerOf = (line: string): ListMarker | null =>
{
    const indent = leadingSpaces(line);
    if(indent > 3)
        return null;
    const first = line.charCodeAt(indent);
    if(first === CODE_DASH || first === CODE_ASTERISK || first === 43)
    {
        const next = charAtOrEdge(line, indent + 1);
        if(next !== EDGE && !isSpaceOrTab(next))
            return null;
        return {ordered: false, start: 1, indent, contentStart: skipSpaces(line, indent + 1)};
    }
    if(isAsciiDigit(first))
    {
        const digits = runLengthWhile(line, indent, isAsciiDigit);
        const separator = line.charCodeAt(indent + digits);
        if(separator !== 46 && separator !== 41)
            return null;
        const next = charAtOrEdge(line, indent + digits + 1);
        if(next !== EDGE && !isSpaceOrTab(next))
            return null;
        return {ordered: true, start: Number(line.slice(indent, indent + digits)), indent, contentStart: skipSpaces(line, indent + digits + 1)};
    }
    return null;
};

const skipSpaces = (line: string, from: number): number =>
{
    let index = from;
    while(isSpaceOrTab(line.charCodeAt(index)))
        index += 1;
    return index;
};

const runLengthWhile = (text: string, start: number, predicate: (code: number) => boolean): number =>
{
    let length = 0;
    while(predicate(text.charCodeAt(start + length)))
        length += 1;
    return length;
};
//endregion

//region Tables
const countPipes = (line: string): number =>
{
    let count = 0;
    for(let index = 0; index < line.length; index += 1)
        if(line.charCodeAt(index) === CODE_PIPE)
            count += 1;
    return count;
};

const splitCells = (line: string): string[] =>
{
    let start = 0;
    let end = line.length;
    if(line.charCodeAt(0) === CODE_PIPE)
        start = 1;
    if(end > start && line.charCodeAt(end - 1) === CODE_PIPE)
        end -= 1;
    const cells: string[] = [];
    let current = start;
    for(let index = start; index <= end; index += 1)
    {
        if(index === end || line.charCodeAt(index) === CODE_PIPE)
        {
            cells.push(line.slice(current, index).trim());
            current = index + 1;
        }
    }
    return cells;
};

const isSeparatorCell = (cell: string): boolean =>
{
    if(cell.length === 0)
        return false;
    let index = 0;
    if(cell.charCodeAt(index) === CODE_COLON)
        index += 1;
    const dashes = runLength(cell, index, CODE_DASH);
    if(dashes === 0)
        return false;
    index += dashes;
    if(index < cell.length && cell.charCodeAt(index) === CODE_COLON)
        index += 1;
    return index === cell.length;
};

const separatorAlignsOf = (line: string): Array<MdAlign | null> | null =>
{
    const cells = splitCells(line);
    if(cells.length === 0)
        return null;
    const aligns: Array<MdAlign | null> = [];
    for(const cell of cells)
    {
        if(!isSeparatorCell(cell))
            return null;
        const leading = cell.charCodeAt(0) === CODE_COLON;
        const trailing = cell.charCodeAt(cell.length - 1) === CODE_COLON;
        aligns.push(leading && trailing ? "center" : leading ? "left" : trailing ? "right" : null);
    }
    return aligns;
};

const isTableStart = (lines: readonly string[], index: number): boolean =>
{
    const header = lines[index]!;
    if(countPipes(header) < 2)
        return false;
    const next = lines[index + 1];
    if(next === undefined)
        return false;
    const aligns = separatorAlignsOf(next);
    return aligns !== null && aligns.length === splitCells(header).length;
};

const parseTable = (lines: readonly string[], start: number): {table: MdTable, next: number} =>
{
    const header = splitCells(lines[start]!).map(cell => parseInlines(cell));
    const aligns = separatorAlignsOf(lines[start + 1]!) ?? [];
    const rows: MdInline[][][] = [];
    let index = start + 2;
    while(index < lines.length)
    {
        const line = lines[index]!;
        if(isBlank(line) || countPipes(line) === 0)
            break;
        rows.push(splitCells(line).map(cell => parseInlines(cell)));
        index += 1;
    }
    return {table: {kind: "table", aligns, header, rows}, next: index};
};
//endregion

//region Block parsing
const startsBlock = (line: string): boolean =>
    fenceOf(line) !== null
    || headingOf(line) !== null
    || isThematicBreak(line)
    || quotePrefixAt(line)
    || listMarkerOf(line) !== null;

const parseFence = (lines: readonly string[], start: number, fence: FenceInfo, blocks: MdBlock[]): number =>
{
    const content: string[] = [];
    let index = start + 1;
    while(index < lines.length)
    {
        const line = lines[index]!;
        if(isClosingFence(line, fence))
        {
            index += 1;
            break;
        }
        content.push(stripIndent(line, fence.indent));
        index += 1;
    }
    blocks.push({kind: "code", language: fence.language, text: content.length > 0 ? `${content.join("\n")}\n` : ""});
    return index;
};

const parseQuote = (lines: readonly string[], start: number): {blocks: MdBlock[], next: number} =>
{
    const collected: string[] = [];
    let index = start;
    while(index < lines.length && !isBlank(lines[index]!) && quotePrefixAt(lines[index]!))
    {
        collected.push(quoteContent(lines[index]!));
        index += 1;
    }
    return {blocks: parseBlocks(collected), next: index};
};

const nextNonBlank = (lines: readonly string[], from: number): number | null =>
{
    for(let index = from; index < lines.length; index += 1)
        if(!isBlank(lines[index]!))
            return index;
    return null;
};

const parseList = (lines: readonly string[], start: number, first: ListMarker, blocks: MdBlock[]): number =>
{
    const baseIndent = first.indent;
    const ordered = first.ordered;
    const items: MdListItem[] = [];
    let itemLines: string[] = [];
    let itemIndent = first.contentStart;

    const flushItem = (): void =>
    {
        items.push({blocks: parseBlocks(itemLines)});
        itemLines = [];
    };

    itemLines.push(lines[start]!.slice(first.contentStart));
    let index = start + 1;
    while(index < lines.length)
    {
        const line = lines[index]!;
        if(isBlank(line))
        {
            const upcoming = nextNonBlank(lines, index);
            if(upcoming === null)
                break;
            const upcomingLine = lines[upcoming]!;
            const marker = listMarkerOf(upcomingLine);
            if(marker !== null && marker.indent === baseIndent && marker.ordered === ordered)
                break;
            if(leadingSpaces(upcomingLine) >= baseIndent + 2 || leadingSpaces(upcomingLine) >= itemIndent)
            {
                itemLines.push("");
                index = upcoming;
                continue;
            }
            break;
        }
        const marker = listMarkerOf(line);
        if(marker !== null && marker.indent === baseIndent && marker.ordered === ordered)
        {
            flushItem();
            itemLines.push(line.slice(marker.contentStart));
            itemIndent = marker.contentStart;
            index += 1;
            continue;
        }
        if(marker !== null && marker.indent > baseIndent)
        {
            // A deeper marker is a nested list: strip the item's content
            // indent so the item's recursive parse sees it at its RELATIVE
            // depth (raw 4-space deep lines would otherwise collapse into
            // siblings of a 2-space list).
            itemLines.push(stripIndent(line, itemIndent));
            index += 1;
            continue;
        }
        const indent = leadingSpaces(line);
        if(indent >= baseIndent + 2 || indent >= itemIndent)
        {
            itemLines.push(stripIndent(line, itemIndent));
            index += 1;
            continue;
        }
        // Lazy continuation: an unindented paragraph line flows into the item,
        // but never across a real block starter (fence/heading/hr/quote/list).
        const last = itemLines[itemLines.length - 1] ?? "";
        if(!isBlank(last) && !startsBlock(line))
        {
            itemLines.push(line);
            index += 1;
            continue;
        }
        break;
    }
    flushItem();
    blocks.push({kind: "list", ordered, start: first.start, items});
    return index;
};

const parseParagraph = (lines: readonly string[], start: number, blocks: MdBlock[]): number =>
{
    const parts: MdInline[][] = [];
    let index = start;
    while(index < lines.length)
    {
        const line = lines[index]!;
        if(isBlank(line) || startsBlock(line) || isTableStart(lines, index))
            break;
        parts.push(parseInlines(line.trim()));
        index += 1;
    }
    const inlines: MdInline[] = [];
    for(const [partIndex, part] of parts.entries())
    {
        if(partIndex > 0)
            inlines.push({kind: "softBreak"});
        inlines.push(...part);
    }
    if(inlines.length === 0)
        inlines.push({kind: "text", text: ""});
    blocks.push({kind: "paragraph", inlines});
    return index;
};

const parseBlocks = (lines: readonly string[]): MdBlock[] =>
{
    const blocks: MdBlock[] = [];
    let index = 0;
    while(index < lines.length)
    {
        const line = lines[index]!;
        if(isBlank(line))
        {
            index += 1;
            continue;
        }
        const fence = fenceOf(line);
        if(fence !== null)
        {
            index = parseFence(lines, index, fence, blocks);
            continue;
        }
        const heading = headingOf(line);
        if(heading !== null)
        {
            blocks.push({kind: "heading", level: heading.level, inlines: parseInlines(heading.content)});
            index += 1;
            continue;
        }
        if(isThematicBreak(line))
        {
            blocks.push({kind: "thematicBreak"});
            index += 1;
            continue;
        }
        if(quotePrefixAt(line))
        {
            const quote = parseQuote(lines, index);
            blocks.push({kind: "quote", blocks: quote.blocks});
            index = quote.next;
            continue;
        }
        const marker = listMarkerOf(line);
        if(marker !== null)
        {
            index = parseList(lines, index, marker, blocks);
            continue;
        }
        if(isTableStart(lines, index))
        {
            const table = parseTable(lines, index);
            blocks.push(table.table);
            index = table.next;
            continue;
        }
        index = parseParagraph(lines, index, blocks);
    }
    return blocks;
};
//endregion

//region Inline parsing
/**
 * One unclosed emphasis opener awaiting a closer. childrenStart is the index
 * in the node array where this opener's children begin, so a close splices
 * them out to become the emphasis node's payload — and an opener that never
 * closes has its marker characters re-inserted verbatim at that position.
 */
interface EmphasisOpen
{
    code: number;
    remaining: number;
    childrenStart: number;
}

const isIntraWordBlocked = (code: number, prev: number, next: number): boolean =>
    code === CODE_UNDERSCORE && isAsciiWordChar(prev) && isAsciiWordChar(next);

const canOpenEmphasis = (code: number, prev: number, next: number, size: number): boolean =>
{
    if(isWhitespaceCode(next))
        return false;
    if(isIntraWordBlocked(code, prev, next))
        return false;
    // Single tildes never open anything — only ~~ pairs form del.
    return code !== CODE_TILDE || size >= 2;
};

const canCloseEmphasis = (code: number, prev: number, next: number): boolean =>
    !isWhitespaceCode(prev) && !isIntraWordBlocked(code, prev, next);

const emphasisNode = (code: number, size: number, children: MdInline[]): MdInline =>
{
    if(code === CODE_TILDE)
        return {kind: "del", children};
    return size >= 2 ? {kind: "strong", children} : {kind: "em", children};
};

/**
 * Consumes one delimiter run against the open-opener stack: closes the
 * nearest same-character opener (partially, if the run is shorter), opens a
 * new entry, or degrades to literal characters. Deliberately more lenient
 * than CommonMark: whitespace is the ONLY adjacency disqualifier, so
 * CJK/fullwidth punctuation flanks open and close emphasis (the user's
 * live repro); intra-word _/__ stays literal to protect snake_case.
 */
const consumeDelimiterRun = (text: string, nodes: MdInline[], opens: EmphasisOpen[], code: number, run: number, pos: number): void =>
{
    const edgePrev = charAtOrEdge(text, pos - 1);
    const edgeNext = charAtOrEdge(text, pos + run);
    let consumed = 0;
    while(consumed < run)
    {
        const remaining = run - consumed;
        const prev = consumed === 0 ? edgePrev : code;
        const next = consumed + remaining === run ? edgeNext : code;
        const top = opens[opens.length - 1];
        if(top !== undefined && top.code === code && canCloseEmphasis(code, prev, next))
        {
            const closed = Math.min(remaining, top.remaining);
            const pairMinimum = code === CODE_TILDE ? 2 : 1;
            if(closed >= pairMinimum)
            {
                const children = nodes.splice(top.childrenStart);
                nodes.push(emphasisNode(code, closed, children));
                top.remaining -= closed;
                if(top.remaining === 0)
                    opens.pop();
                consumed += closed;
                continue;
            }
        }
        if(canOpenEmphasis(code, prev, next, remaining))
        {
            opens.push({code, remaining, childrenStart: nodes.length});
            consumed = run;
            continue;
        }
        nodes.push({kind: "text", text: repeatCode(code, remaining)});
        consumed = run;
    }
};

const findBacktickRun = (text: string, from: number, size: number): number | null =>
{
    let index = from;
    while(index < text.length)
    {
        if(text.charCodeAt(index) !== CODE_BACKTICK)
        {
            index += 1;
            continue;
        }
        const run = runLength(text, index, CODE_BACKTICK);
        if(run === size)
            return index;
        index += run;
    }
    return null;
};

/** CommonMark's pad rule: strip one flanking space unless the content is all spaces. */
const stripCodePadding = (content: string): string =>
{
    if(content.length < 2
        || content.charCodeAt(0) !== CODE_SPACE
        || content.charCodeAt(content.length - 1) !== CODE_SPACE)
        return content;
    for(let index = 1; index < content.length - 1; index += 1)
        if(content.charCodeAt(index) !== CODE_SPACE)
            return content.slice(1, content.length - 1);
    return content;
};

interface LinkMatch
{
    href: string;
    text: string;
    next: number;
}

const tryLink = (text: string, start: number): LinkMatch | null =>
{
    let depth = 1;
    let cursor = start + 1;
    while(cursor < text.length)
    {
        const code = text.charCodeAt(cursor);
        if(code === CODE_LBRACKET)
            depth += 1;
        else if(code === CODE_RBRACKET)
        {
            depth -= 1;
            if(depth === 0)
                break;
        }
        cursor += 1;
    }
    if(cursor >= text.length || text.charCodeAt(cursor + 1) !== CODE_LPAREN)
        return null;
    const hrefStart = cursor + 2;
    let parenDepth = 1;
    let end = hrefStart;
    while(end < text.length)
    {
        const code = text.charCodeAt(end);
        if(code === CODE_LPAREN)
            parenDepth += 1;
        else if(code === CODE_RPAREN)
        {
            parenDepth -= 1;
            if(parenDepth === 0)
                break;
        }
        end += 1;
    }
    if(end >= text.length)
        return null;
    const href = text.slice(hrefStart, end);
    for(let index = 0; index < href.length; index += 1)
        if(isWhitespaceCode(href.charCodeAt(index)))
            return null;
    return {href: href.trim(), text: text.slice(start + 1, cursor), next: end + 1};
};

const startsWithScheme = (text: string, at: number, scheme: string): boolean =>
{
    if(at + scheme.length > text.length)
        return false;
    for(let index = 0; index < scheme.length; index += 1)
    {
        const want = scheme.charCodeAt(index);
        const have = text.charCodeAt(at + index);
        if(have !== want && have !== (want >= 97 ? want - 32 : want))
            return false;
    }
    return true;
};

/**
 * The anchor href allowlist absorbed from the old SAFE_HREF: only http(s)
 * and mailto destinations may become live anchors (the renderer enforces
 * it); anything else — javascript:, data:, vbscript: — degrades to text.
 */
export const isSafeHref = (href: string): boolean =>
{
    // noinspection HttpUrlsUsage — the literal is an allowlist scheme key, not a browsed link.
    if(startsWithScheme(href, 0, "http://"))
        return true;
    return startsWithScheme(href, 0, "https://") || startsWithScheme(href, 0, "mailto:");
};

/** Chars that can appear in a URL: everything except whitespace and closers. */
const isUrlBoundary = (code: number): boolean =>
    isWhitespaceCode(code)
    || code === CODE_RPAREN
    || code === CODE_RBRACKET
    || code === CODE_GT
    || code === 34
    || code === 39
    || code === CODE_BACKTICK
    // Fullwidth/CJK closers: URLs never contain them, chat prose ends with them.
    || code === 12290 || code === 12289 || code === 65292 || code === 65289
    || code === 12305 || code === 12307 || code === 12299
    // Corner brackets 「」『』 (U+300C..U+300F): quoted URLs must close at the bracket.
    || code === 12300 || code === 12301 || code === 12302 || code === 12303;

const parenBalance = (url: string): number =>
{
    let balance = 0;
    for(let index = 0; index < url.length; index += 1)
    {
        const code = url.charCodeAt(index);
        if(code === CODE_LPAREN)
            balance += 1;
        else if(code === CODE_RPAREN)
            balance -= 1;
    }
    return balance;
};

const isTrailingUrlPunct = (code: number): boolean =>
    code === 46 || code === 44 || code === 59 || code === CODE_COLON
    || code === 33 || code === 63 || code === 34 || code === 39
    || code === CODE_ASTERISK || code === CODE_UNDERSCORE || code === CODE_TILDE;

/** Scans a bare URL and trims trailing prose punctuation and unbalanced closers. */
const scanUrl = (text: string, start: number): string =>
{
    let end = start;
    while(end < text.length && !isUrlBoundary(text.charCodeAt(end)))
        end += 1;
    let url = text.slice(start, end);
    let trimmed = true;
    while(trimmed && url.length > 0)
    {
        trimmed = false;
        const last = url.charCodeAt(url.length - 1);
        if(last === CODE_RPAREN && parenBalance(url) < 0)
        {
            url = url.slice(0, -1);
            trimmed = true;
            continue;
        }
        if(isTrailingUrlPunct(last))
        {
            url = url.slice(0, -1);
            trimmed = true;
        }
    }
    return url;
};

const isUrlStart = (text: string, at: number): boolean =>
{
    if(at > 0)
    {
        const prev = text.charCodeAt(at - 1);
        if(isAsciiLetter(prev) || isAsciiDigit(prev))
            return false;
    }
    // noinspection HttpUrlsUsage — scheme detection for bare-URL autolinks.
    return startsWithScheme(text, at, "https://") || startsWithScheme(text, at, "http://");
};

const parseInlines = (text: string, noLinks = false): MdInline[] =>
{
    const nodes: MdInline[] = [];
    const opens: EmphasisOpen[] = [];
    let buffer = "";
    const flush = (): void =>
    {
        if(buffer !== "")
        {
            nodes.push({kind: "text", text: buffer});
            buffer = "";
        }
    };
    let index = 0;
    while(index < text.length)
    {
        const code = text.charCodeAt(index);
        if(code === CODE_BACKSLASH)
        {
            const escaped = charAtOrEdge(text, index + 1);
            if(escaped !== EDGE && isEscapablePunct(escaped))
            {
                buffer += String.fromCharCode(escaped);
                index += 2;
            }
            else
            {
                buffer += String.fromCharCode(CODE_BACKSLASH);
                index += 1;
            }
            continue;
        }
        if(code === CODE_BACKTICK)
        {
            const run = runLength(text, index, CODE_BACKTICK);
            const close = findBacktickRun(text, index + run, run);
            if(close === null)
            {
                buffer += text.slice(index, index + run);
                index += run;
            }
            else
            {
                flush();
                nodes.push({kind: "code", text: stripCodePadding(text.slice(index + run, close))});
                index = close + run;
            }
            continue;
        }
        if(code === CODE_ASTERISK || code === CODE_UNDERSCORE || code === CODE_TILDE)
        {
            const run = runLength(text, index, code);
            flush();
            consumeDelimiterRun(text, nodes, opens, code, run, index);
            index += run;
            continue;
        }
        if(code === CODE_LBRACKET)
        {
            //* Link text parses NO links: a nested `[..](..)` would emit an
            //! anchor inside an anchor (invalid HTML; one click fires two
            // /shell/open) — the inner syntax degrades to its literal text.
            const link = noLinks ? null : tryLink(text, index);
            if(link === null)
            {
                buffer += String.fromCharCode(CODE_LBRACKET);
                index += 1;
            }
            else
            {
                flush();
                nodes.push({kind: "link", href: link.href, children: parseInlines(link.text, true)});
                index = link.next;
            }
            continue;
        }
        if(!noLinks && isUrlStart(text, index))
        {
            const url = scanUrl(text, index);
            flush();
            nodes.push({kind: "link", href: url, children: [{kind: "text", text: url}]});
            index += url.length;
            continue;
        }
        buffer += text[index]!;
        index += 1;
    }
    flush();
    // Unclosed openers give their markers back as literal text — re-inserted
    // highest (latest) mark first so earlier marks stay index-stable.
    while(opens.length > 0)
    {
        const open = opens.pop()!;
        nodes.splice(open.childrenStart, 0, {kind: "text", text: repeatCode(open.code, open.remaining)});
    }
    return mergeTextNodes(nodes);
};

/** Literal delimiter runs land as separate text nodes; adjacent ones coalesce. */
const mergeTextNodes = (nodes: MdInline[]): MdInline[] =>
{
    const merged: MdInline[] = [];
    for(const node of nodes)
    {
        const last = merged[merged.length - 1];
        if(node.kind === "text" && last?.kind === "text")
            last.text += node.text;
        else
            merged.push(node);
    }
    return merged;
};
//endregion

/**
 * Parses chat markdown into the block AST the renderer maps to DOM.
 * Pure: no DOM access, no ambient state.
 */
export const parseMarkdown = (source: string): MdBlock[] =>
    parseBlocks(splitLines(source));
