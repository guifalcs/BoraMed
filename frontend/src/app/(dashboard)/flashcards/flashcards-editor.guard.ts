import type { CanDeactivateFn } from '@angular/router';
import type { DeckEditorComponent } from './deck-editor/deck-editor.component';

export const sairDoEditorFlashcardsGuard: CanDeactivateFn<DeckEditorComponent> = (editor) =>
  editor.podeSair();
