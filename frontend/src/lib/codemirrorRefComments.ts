/**
 * CodeMirror plugin that visually dims `<!-- ref: X -->` markers in the
 * markdown editor. The markers stay in the underlying text (so they survive
 * editing and round-trip back to the LLM during refine), but they're hard
 * to notice — letting the user focus on the actual explanation.
 */
import { Decoration, ViewPlugin, EditorView } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

const REF_COMMENT_RE = /<!--\s*ref:[^>]*?-->/g;

const dimDeco = Decoration.mark({ class: 'cm-ref-comment' });

export const dimRefCommentsExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }

    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to);
        REF_COMMENT_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = REF_COMMENT_RE.exec(text)) !== null) {
          const start = from + m.index;
          const end = start + m[0].length;
          builder.add(start, end, dimDeco);
        }
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations },
);
