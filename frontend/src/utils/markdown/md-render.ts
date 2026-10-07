/**
 * Chat markdown DOM renderer: block AST (md-parser) in, HTMLElement out.
 *
 * The safety contract is structural: the renderer builds DOM with
 * createElement/textContent ONLY — zero innerHTML anywhere — so a text run
 * can never become a live element no matter what the model emitted (the old
 * escape-then-parse pipeline is retired, not fixed). Anchor destinations
 * pass the http/https/mailto allowlist (isSafeHref); anything else degrades
 * to its plain text. List markers are explicit spans so indentation never
 * depends on UA list CSS — the missing-marker bug this renderer was written
 * to kill.
 *
 * //! 移植自 kv-unix src/shared/chat 2026-10-05, 上游修复需手动同步; 逻辑逐字保留禁改.
 */

/**
 * Minimal DOM element factory (//! 自 kv-unix @src/shared/ui/dom.f.ts 内联:
 * 本项目无该模块, 零新增依赖约束下改为文件内等价实现; 签名沿用上游 [[El]]
 * 泛型, 使 `el("div", ...)` 仍特化为 HTMLDivElement).
 *
 * Attributes go through `setAttribute` verbatim — string values only, so
 * `class`, `data-*` and ARIA pass through, but event handlers/properties
 * must be attached after creation. Children append in argument order.
 */
const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: Record<string, string> = {},
    ...children: Array<Node | string>
): HTMLElementTagNameMap[K] =>
{
    const element = document.createElement(tag);
    for(const [key, value] of Object.entries(attrs))
        element.setAttribute(key, value);
    //* 字符串子节点必须走 createTextNode 路径而非 innerHTML — textContent 安全契约的根基.
    for(const child of children)
        element.append(typeof child === "string" ? document.createTextNode(child) : child);
    return element;
};

import {isSafeHref} from "./md-parser";
import type {MdAlign, MdBlock, MdInline, MdLink, MdList} from "./md-parser";

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

/** The shared scope class both chat consumers (assistant bodies + reasoning) hang their styles on. */
export const MD_SCOPE_CLASS = "kv-chat-md";

/**
 * Renders a parsed document into the kv-chat-md container. Returns the
 * container even for an empty document (the reasoning caret appends into
 * it); consumers attach their own extras (break-words, selectability,
 * anchor click-intercept) on top.
 */
export const renderMdDocument = (blocks: readonly MdBlock[]): HTMLDivElement =>
{
    const container = el("div", {class: MD_SCOPE_CLASS});
    appendBlocks(container, blocks);
    return container;
};

const appendBlocks = (parent: HTMLElement, blocks: readonly MdBlock[]): void =>
{
    for(const block of blocks)
        parent.append(renderBlock(block));
};

const renderBlock = (block: MdBlock): HTMLElement =>
{
    switch(block.kind)
    {
        case "paragraph":
            return el("p", {}, ...renderInlineNodes(block.inlines));
        case "heading":
            return el(HEADING_TAGS[block.level - 1] ?? "h6", {}, ...renderInlineNodes(block.inlines));
        case "code":
            return renderCodeBlock(block.language, block.text);
        case "thematicBreak":
            return el("hr", {});
        case "quote":
        {
            const quote = el("blockquote", {});
            appendBlocks(quote, block.blocks);
            return quote;
        }
        case "list":
            return renderList(block);
        case "table":
            return renderTable(block.aligns, block.header, block.rows);
    }
};

/**
 * The fenced/indented code block: pre > code with the language class
 * (augmentCodeBlocks' selector target) plus a data-lang stamp. The text
 * goes in via textContent — entities stay characters, injected tags stay
 * inert.
 */
const renderCodeBlock = (language: string, text: string): HTMLElement =>
{
    const attrs: Record<string, string> = {"data-lang": language};
    if(language !== "")
        attrs.class = `language-${language}`;
    const code = el("code", attrs);
    code.textContent = text;
    return el("pre", {}, code);
};

const renderList = (block: MdList): HTMLElement =>
{
    const list = block.ordered
        ? (block.start !== 1 ? el("ol", {start: String(block.start)}) : el("ol", {}))
        : el("ul", {});
    let number = block.start;
    for(const item of block.items)
    {
        const marker = el(
            "span",
            //* aria-hidden: the ul/ol semantics already carry numbering to AT.
            {class: 'kv-chat-md-marker', "aria-hidden": "true"},
            block.ordered ? `${number}.` : "•");
        if(block.ordered)
            number += 1;
        const body = el("div", {class: 'kv-chat-md-li-body'});
        appendBlocks(body, item.blocks);
        list.append(el("li", {}, marker, body));
    }
    return list;
};

const renderTable = (aligns: ReadonlyArray<MdAlign | null>, header: ReadonlyArray<MdInline[]>, rows: ReadonlyArray<MdInline[][]>): HTMLElement =>
{
    const table = el("table", {});
    const head = el("thead", {});
    const headRow = el("tr", {});
    header.forEach((cells, column) => { headRow.append(renderCell("th", cells, aligns[column] ?? null)); });
    head.append(headRow);
    table.append(head);
    const body = el("tbody", {});
    for(const row of rows)
    {
        const rowElement = el("tr", {});
        row.forEach((cells, column) => { rowElement.append(renderCell("td", cells, aligns[column] ?? null)); });
        body.append(rowElement);
    }
    table.append(body);
    //* A wide table must scroll INSIDE its wrapper — a bare table at the md
    //! root overflows the transcript and once dragged a horizontal scrollbar
    //! across the whole chat window (the D4 live defect).
    return el("div", {class: "kv-chat-md-tablewrap"}, table);
};

const renderCell = (tag: "th" | "td", cells: ReadonlyArray<MdInline>, align: MdAlign | null): HTMLElement =>
{
    const attrs: Record<string, string> = align === null ? {} : {style: `text-align: ${align}`};
    return el(tag, attrs, ...renderInlineNodes([...cells]));
};

const renderInlineNodes = (inlines: ReadonlyArray<MdInline>): Node[] =>
{
    const nodes: Node[] = [];
    for(const inline of inlines)
    {
        switch(inline.kind)
        {
            case "text":
                nodes.push(document.createTextNode(inline.text));
                break;
            case "softBreak":
                nodes.push(el("br", {}));
                break;
            case "strong":
                nodes.push(el("strong", {}, ...renderInlineNodes(inline.children)));
                break;
            case "em":
                nodes.push(el("em", {}, ...renderInlineNodes(inline.children)));
                break;
            case "del":
                nodes.push(el("del", {}, ...renderInlineNodes(inline.children)));
                break;
            case "code":
            {
                const code = el("code", {});
                code.textContent = inline.text;
                nodes.push(code);
                break;
            }
            case "link":
                nodes.push(...renderLinkNodes(inline));
                break;
        }
    }
    return nodes;
};

/**
 * Denylisted destinations (javascript:/data:/anything off the allowlist)
 * render as their plain children — the anchor simply never exists, so no
 * post-pass stripping is needed and the click path stays safe by shape.
 */
const renderLinkNodes = (link: MdLink): Node[] =>
{
    const children = renderInlineNodes(link.children);
    if(!isSafeHref(link.href))
        return children;
    return [el("a", {href: link.href}, ...children)];
};
