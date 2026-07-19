/**
 * CodeMirror extension that paints given line numbers red.
 *
 * Use:
 *   1. Add `errorLineExtension` to the editor's `extensions` array
 *   2. Dispatch `setErrorLines([3, 7])` on the editor view to update
 */
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';

export const setErrorLinesEffect = StateEffect.define<number[]>();

const errorLineDecoration = Decoration.line({ attributes: { class: 'cm-error-line' } });

const errorLinesField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setErrorLinesEffect)) {
        const builder = new RangeSetBuilder<Decoration>();
        const totalLines = tr.state.doc.lines;
        for (const n of effect.value) {
          if (n < 1 || n > totalLines) continue;
          const line = tr.state.doc.line(n);
          builder.add(line.from, line.from, errorLineDecoration);
        }
        next = builder.finish();
      }
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const errorLineExtension = errorLinesField;
