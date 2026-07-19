/**
 * CodeMirror extension that paints given line ranges with a brand-accent
 * highlight — used by the hover-to-link feature between the explanation
 * paragraphs and the SHACL code.
 *
 * Use:
 *   1. Add `hoverHighlightExtension` to the editor's `extensions` array.
 *   2. Dispatch `setHoverHighlightEffect.of(ranges)` to update.
 */
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';
import type { LineRange } from './turtlePropertyMap';

export const setHoverHighlightEffect = StateEffect.define<LineRange[]>();

const hoverLineDecoration = Decoration.line({
  attributes: { class: 'cm-hover-highlight' },
});

const hoverField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setHoverHighlightEffect)) {
        const builder = new RangeSetBuilder<Decoration>();
        const totalLines = tr.state.doc.lines;
        for (const range of effect.value) {
          const from = Math.max(1, range.start);
          const to = Math.min(totalLines, range.end);
          for (let n = from; n <= to; n++) {
            const line = tr.state.doc.line(n);
            builder.add(line.from, line.from, hoverLineDecoration);
          }
        }
        next = builder.finish();
      }
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const hoverHighlightExtension = hoverField;
