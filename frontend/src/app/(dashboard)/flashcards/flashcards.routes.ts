import { Routes } from '@angular/router';
import { sairDoEditorFlashcardsGuard } from './flashcards-editor.guard';

export const flashcardsRoutes: Routes = [
  {
    path: '',
    title: 'Flashcards',
    loadComponent: () =>
      import('./home/flashcards-home.component').then((m) => m.FlashcardsHomeComponent),
  },
  {
    path: 'novo',
    canDeactivate: [sairDoEditorFlashcardsGuard],
    title: 'Novo deck de flashcards',
    loadComponent: () =>
      import('./deck-editor/deck-editor.component').then((m) => m.DeckEditorComponent),
  },
  {
    path: ':deckId/editar',
    canDeactivate: [sairDoEditorFlashcardsGuard],
    title: 'Editar deck de flashcards',
    loadComponent: () =>
      import('./deck-editor/deck-editor.component').then((m) => m.DeckEditorComponent),
  },
  {
    path: ':deckId/estudar',
    title: 'Estudar flashcards',
    loadComponent: () =>
      import('./deck-execucao/deck-execucao.component').then((m) => m.DeckExecucaoComponent),
  },
];
