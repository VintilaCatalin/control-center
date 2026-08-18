import { marked, type Token, type Tokens } from 'marked';
import { Fragment, type ReactNode } from 'react';
import { highlightCode } from './highlight';
import { CheckIcon } from './icons';
import styles from './Markdown.module.css';

// [[Wikilink]] isn't standard markdown - marked has no idea what to do
// with it. Rather than writing a full marked extension, it's cheaper and
// just as correct to rewrite it into a link marked already understands
// before tokenising, tagged with a `wikilink:` pseudo-scheme so the link
// renderer below can tell it apart from a real URL. This is the same
// name-match convention the old app's wikilink handling used (no
// aliases, no path disambiguation) - preserved on purpose, not a
// regression, since that's what the vault's existing notes actually rely
// on today.
function preprocessWikilinks(src: string): string {
  return src.replace(/\[\[([^\]|]+)\]\]/g, (_m, name: string) => {
    const trimmed = name.trim();
    return `[${trimmed}](wikilink:${encodeURIComponent(trimmed)})`;
  });
}

interface MarkdownProps {
  text: string;
  onWikiLink: (name: string) => void;
  onToggleTask?: (raw: string, checked: boolean) => void;
}

// A small hand-written token-to-React renderer, not dangerouslySetInnerHTML
// off marked's own HTML output - every element is a real styled component
// keyed to the shared typography tokens (see Markdown.module.css), which
// is what actually makes this read as a premium reading surface instead
// of "rendered markdown with a stylesheet on it".
export function Markdown({ text, onWikiLink, onToggleTask }: MarkdownProps) {
  const tokens = marked.lexer(preprocessWikilinks(text));
  return (
    <div className={styles.doc}>
      {tokens.map((t, i) => (
        <Block key={i} token={t} onWikiLink={onWikiLink} onToggleTask={onToggleTask} />
      ))}
    </div>
  );
}

function Block({
  token,
  onWikiLink,
  onToggleTask,
}: {
  token: Token;
  onWikiLink: (name: string) => void;
  onToggleTask?: (raw: string, checked: boolean) => void;
}) {
  switch (token.type) {
    case 'heading': {
      const Tag = (`h${Math.min(token.depth, 4)}` as unknown) as 'h1' | 'h2' | 'h3' | 'h4';
      const cls = ['', styles.h1, styles.h2, styles.h3, styles.h4][Math.min(token.depth, 4)];
      return (
        <Tag className={cls}>
          <Inline tokens={token.tokens} onWikiLink={onWikiLink} />
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p className={styles.p}>
          <Inline tokens={token.tokens} onWikiLink={onWikiLink} />
        </p>
      );
    case 'blockquote': {
      const quote = token as Tokens.Blockquote;
      return (
        <blockquote className={styles.quote}>
          {quote.tokens.map((c, i) => (
            <Block key={i} token={c} onWikiLink={onWikiLink} onToggleTask={onToggleTask} />
          ))}
        </blockquote>
      );
    }
    case 'code': {
      const highlighted = highlightCode(token.text, token.lang);
      return (
        <pre className={styles.pre}>
          {highlighted && <span className={styles.codeLang}>{highlighted.language}</span>}
          {highlighted ? (
            <code className={styles.code} dangerouslySetInnerHTML={{ __html: highlighted.html }} />
          ) : (
            <code className={styles.code}>{token.text}</code>
          )}
        </pre>
      );
    }
    case 'list':
      return (
        <List token={token as Tokens.List} onWikiLink={onWikiLink} onToggleTask={onToggleTask} />
      );
    case 'table':
      return <Table token={token as Tokens.Table} onWikiLink={onWikiLink} />;
    case 'hr':
      return <hr className={styles.hr} />;
    case 'space':
      return null;
    default:
      return 'raw' in token && token.raw ? <p className={styles.p}>{token.raw}</p> : null;
  }
}

function List({
  token,
  onWikiLink,
  onToggleTask,
}: {
  token: Tokens.List;
  onWikiLink: (name: string) => void;
  onToggleTask?: (raw: string, checked: boolean) => void;
}) {
  const Tag = token.ordered ? 'ol' : 'ul';
  return (
    <Tag className={styles.list}>
      {token.items.map((item, i) => (
        <li key={i} className={item.task ? styles.taskItem : undefined}>
          {item.task ? (
            <label className={styles.task}>
              <input
                type="checkbox"
                className={styles.taskInput}
                checked={!!item.checked}
                onChange={(e) => onToggleTask?.(item.raw, e.target.checked)}
              />
              <span className={styles.taskBox}>
                <CheckIcon />
              </span>
              <span className={item.checked ? styles.taskDone : undefined}>
                <Inline tokens={item.tokens.filter((t) => t.type !== 'checkbox')} onWikiLink={onWikiLink} />
              </span>
            </label>
          ) : (
            <Inline tokens={item.tokens} onWikiLink={onWikiLink} />
          )}
        </li>
      ))}
    </Tag>
  );
}

function Table({ token, onWikiLink }: { token: Tokens.Table; onWikiLink: (name: string) => void }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {token.header.map((cell, i) => (
              <th key={i} style={{ textAlign: cell.align ?? undefined }}>
                <Inline tokens={cell.tokens} onWikiLink={onWikiLink} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {token.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ textAlign: cell.align ?? undefined }}>
                  <Inline tokens={cell.tokens} onWikiLink={onWikiLink} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Inline tokens (text/strong/em/link/codespan/...) recurse through the
// same small set of cases - lists/blockquotes nest Block, everything
// inside a line nests Inline. Two functions, not one, because a list
// item's own text is inline-flavoured even though the list itself is a
// block.
function Inline({ tokens, onWikiLink }: { tokens: Token[] | undefined; onWikiLink: (name: string) => void }): ReactNode {
  if (!tokens) return null;
  return (
    <>
      {tokens.map((t, i) => (
        <InlineToken key={i} token={t} onWikiLink={onWikiLink} />
      ))}
    </>
  );
}

function InlineToken({ token, onWikiLink }: { token: Token; onWikiLink: (name: string) => void }) {
  switch (token.type) {
    case 'text':
      return <Fragment>{'tokens' in token && token.tokens ? <Inline tokens={token.tokens} onWikiLink={onWikiLink} /> : token.text}</Fragment>;
    case 'escape':
      return <Fragment>{token.text}</Fragment>;
    case 'strong':
      return (
        <strong>
          <Inline tokens={token.tokens} onWikiLink={onWikiLink} />
        </strong>
      );
    case 'em':
      return (
        <em>
          <Inline tokens={token.tokens} onWikiLink={onWikiLink} />
        </em>
      );
    case 'del':
      return (
        <del>
          <Inline tokens={token.tokens} onWikiLink={onWikiLink} />
        </del>
      );
    case 'codespan':
      return <code className={styles.codespan}>{token.text}</code>;
    case 'br':
      return <br />;
    case 'link': {
      if (token.href.startsWith('wikilink:')) {
        const name = decodeURIComponent(token.href.slice('wikilink:'.length));
        return (
          <a
            className={styles.wikilink}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onWikiLink(name);
            }}
          >
            <Inline tokens={token.tokens} onWikiLink={onWikiLink} />
          </a>
        );
      }
      return (
        <a className={styles.link} href={token.href} target="_blank" rel="noreferrer">
          <Inline tokens={token.tokens} onWikiLink={onWikiLink} />
        </a>
      );
    }
    default:
      return <Fragment>{'raw' in token ? token.raw : ''}</Fragment>;
  }
}
