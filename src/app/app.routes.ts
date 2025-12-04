import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'npc-brain', pathMatch: 'full' },
  {
    path: 'npc-brain',
    loadComponent: () =>
      import('./features/npc-brain/npc-brain.component').then(
        (m) => m.NpcBrainComponent
      ),
    title: 'NPC Brain - WebLLM Chat',
  },
  {
    path: 'semantic-search',
    loadComponent: () =>
      import('./features/semantic-search/semantic-search.component').then(
        (m) => m.SemanticSearchComponent
      ),
    title: 'Semantic Search - Vector Embeddings',
  },
  {
    path: 'object-remover',
    loadComponent: () =>
      import('./features/object-remover/object-remover.component').then(
        (m) => m.ObjectRemoverComponent
      ),
    title: 'Object Remover - Background Removal',
  },
  {
    path: 'telekinetic-ui',
    loadComponent: () =>
      import('./features/telekinetic-ui/telekinetic-ui.component').then(
        (m) => m.TelekineticUiComponent
      ),
    title: 'Telekinetic UI - Hand Tracking',
  },
  {
    path: 'live-translator',
    loadComponent: () =>
      import('./features/live-translator/live-translator.component').then(
        (m) => m.LiveTranslatorComponent
      ),
    title: 'Live Translator - Speech to Text',
  },
  { path: '**', redirectTo: 'npc-brain' },
];
