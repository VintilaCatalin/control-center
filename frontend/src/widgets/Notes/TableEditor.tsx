import { useEffect, useState } from 'react';
import { Sheet } from '../../primitives/Sheet/Sheet';
import sheetStyles from './NoteSheets.module.css';
import type { MarkdownTableData, TableAlignment } from './markdownTable';
import styles from './TableEditor.module.css';

interface TableEditorProps {
  open: boolean;
  initial: MarkdownTableData | null;
  onClose: () => void;
  onSave: (table: MarkdownTableData) => void;
}

export function TableEditor({ open, initial, onClose, onSave }: TableEditorProps) {
  const [table, setTable] = useState<MarkdownTableData>(emptyTable());
  useEffect(() => {
    if (open) setTable(initial ? cloneTable(initial) : emptyTable());
  }, [open, initial]);

  function updateHeader(column: number, value: string) {
    setTable((current) => ({ ...current, headers: current.headers.map((cell, index) => index === column ? value : cell) }));
  }

  function updateCell(row: number, column: number, value: string) {
    setTable((current) => ({ ...current, rows: current.rows.map((cells, rowIndex) => rowIndex === row ? cells.map((cell, cellIndex) => cellIndex === column ? value : cell) : cells) }));
  }

  function addColumn() {
    setTable((current) => ({ headers: [...current.headers, `Column ${current.headers.length + 1}`], alignments: [...current.alignments, null], rows: current.rows.map((row) => [...row, '']) }));
  }

  function removeColumn(column: number) {
    if (table.headers.length === 1) return;
    setTable((current) => ({ headers: current.headers.filter((_, index) => index !== column), alignments: current.alignments.filter((_, index) => index !== column), rows: current.rows.map((row) => row.filter((_, index) => index !== column)) }));
  }

  function addRow() {
    setTable((current) => ({ ...current, rows: [...current.rows, current.headers.map(() => '')] }));
  }

  function setAlignment(column: number, alignment: TableAlignment) {
    setTable((current) => ({ ...current, alignments: current.alignments.map((value, index) => index === column ? alignment : value) }));
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit table"
      subtitle="Write in a proper grid. Control Center converts it back to portable Markdown when you save."
      size="wide"
      actions={<><button type="button" className={sheetStyles.btn} onClick={onClose}>Cancel</button><button type="button" className={`${sheetStyles.btn} ${sheetStyles.primary}`} onClick={() => onSave(table)}>Save table</button></>}
    >
      <div className={styles.scroller}>
        <table className={styles.grid}>
          <thead>
            <tr>
              {table.headers.map((header, column) => (
                <th key={column}>
                  <input value={header} onChange={(event) => updateHeader(column, event.target.value)} aria-label={`Column ${column + 1} heading`} />
                  <span className={styles.columnTools}>
                    <select value={table.alignments[column] ?? ''} onChange={(event) => setAlignment(column, (event.target.value || null) as TableAlignment)} aria-label={`Column ${column + 1} alignment`}>
                      <option value="">Default</option><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
                    </select>
                    <button type="button" onClick={() => removeColumn(column)} disabled={table.headers.length === 1} title="Remove column">×</button>
                  </span>
                </th>
              ))}
              <th className={styles.endcap}><button type="button" className={styles.addColumn} onClick={addColumn}>+ Column</button></th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, column) => <td key={column}><textarea value={cell} onChange={(event) => updateCell(rowIndex, column, event.target.value)} aria-label={`Row ${rowIndex + 1}, column ${column + 1}`} /></td>)}
                <td className={styles.endcap}><button type="button" className={styles.removeRow} onClick={() => setTable((current) => ({ ...current, rows: current.rows.filter((_, index) => index !== rowIndex) }))} title="Remove row">×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className={styles.addRow} onClick={addRow}>+ Add row</button>
    </Sheet>
  );
}

function emptyTable(): MarkdownTableData {
  return { headers: ['Column 1', 'Column 2'], alignments: [null, null], rows: [['', ''], ['', '']] };
}

function cloneTable(table: MarkdownTableData): MarkdownTableData {
  return { headers: [...table.headers], alignments: [...table.alignments], rows: table.rows.map((row) => [...row]) };
}
