import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
  computed,
} from '@angular/core';
import { FileText, Loader } from 'lucide-angular';
import { SupabaseService } from '../../../core/services/supabase.service';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

const BUCKET = 'materiais';
const MAX_BYTES = 52428800;
const ALLOWED_MIME = ['application/pdf'];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

@Component({
  selector: 'app-pdf-upload',
  standalone: true,
  imports: [UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pdf-upload">
      @if (currentPath()) {
        <div class="pdf-preview">
          <app-ui-icon [icon]="iconPdf" [size]="20" class="pdf-preview__icon" />
          <span class="pdf-preview__name">{{ nomeExibido() }}</span>
          <button
            type="button"
            class="pdf-btn pdf-btn--danger"
            [disabled]="uploading()"
            (click)="remover()"
          >
            Remover
          </button>
        </div>
      } @else {
        <button
          type="button"
          class="pdf-dropzone"
          [disabled]="uploading()"
          (click)="abrirSeletor()"
        >
          @if (uploading()) {
            <app-ui-icon [icon]="iconLoader" [size]="22" />
            <span>Enviando…</span>
          } @else {
            <app-ui-icon [icon]="iconPdf" [size]="22" />
            <span class="pdf-dropzone__label">Clique para adicionar PDF</span>
            <span class="pdf-dropzone__hint">PDF · máx 50 MB</span>
          }
        </button>
      }

      @if (erro()) {
        <p class="pdf-error">{{ erro() }}</p>
      }

      <input
        #arquivoInput
        type="file"
        accept="application/pdf"
        style="display:none"
        (change)="onFileSelected($event)"
      />
    </div>

    <style>
      .pdf-upload { display: flex; flex-direction: column; gap: 0.5rem; }

      .pdf-dropzone {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 0.25rem; padding: 1.5rem; border: 2px dashed var(--color-border);
        border-radius: 10px; background: var(--color-surface-2); cursor: pointer;
        width: 100%; text-align: center; font-family: inherit;
        transition: border-color 0.15s, background 0.15s;
      }
      .pdf-dropzone:hover:not(:disabled) { border-color: var(--color-primary-light); background: #eff6ff; }
      .pdf-dropzone:disabled { opacity: 0.6; cursor: not-allowed; }
      .pdf-dropzone__label { font-size: 0.875rem; font-weight: 500; color: var(--color-text); }
      .pdf-dropzone__hint  { font-size: 0.75rem; color: var(--color-text-muted); }

      .pdf-preview {
        display: flex; align-items: center; gap: 0.75rem;
        padding: 0.75rem 1rem; border: 1px solid var(--color-border);
        border-radius: 8px; background: var(--color-surface);
      }
      .pdf-preview__icon { color: #2563eb; flex-shrink: 0; }
      .pdf-preview__name {
        flex: 1; min-width: 0; font-size: 0.875rem; color: var(--color-text);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }

      .pdf-btn {
        padding: 0.375rem 0.875rem; border-radius: 6px; font-size: 0.8125rem; font-weight: 500;
        cursor: pointer; border: 1px solid transparent; font-family: inherit; flex-shrink: 0;
        transition: background 0.15s;
      }
      .pdf-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .pdf-btn--danger { background: #fee2e2; color: #b91c1c; border-color: #fca5a5; }
      .pdf-btn--danger:hover:not(:disabled) { background: #fecaca; }

      .pdf-error { font-size: 0.8125rem; color: #b91c1c; margin: 0; }
    </style>
  `,
})
export class PdfUploadComponent {
  private readonly supabase = inject(SupabaseService).client;

  protected readonly iconLoader = Loader;
  protected readonly iconPdf = FileText;

  readonly currentPath = input<string | null>(null);
  readonly prefix = input<string>('misc');
  readonly pathChange = output<{ storagePath: string; tamanhoBytes: number } | null>();

  protected readonly uploading = signal(false);
  protected readonly erro = signal<string | null>(null);

  private _sessionPath: string | null = null;

  constructor() {
    // Quando o pai zera o currentPath (registro salvo ou removido), o arquivo
    // já está persistido/limpo — descarta o sessionPath para que o PRÓXIMO
    // upload não delete o arquivo recém-confirmado do storage.
    effect(() => {
      if (!this.currentPath()) {
        this._sessionPath = null;
      }
    });
  }

  protected readonly nomeExibido = computed(() => {
    const path = this.currentPath();
    if (!path) return '';
    const parts = path.split('/');
    return parts[parts.length - 1];
  });

  private readonly _inputRef = viewChild.required<ElementRef<HTMLInputElement>>('arquivoInput');

  protected abrirSeletor(): void {
    this._inputRef().nativeElement.click();
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (!ALLOWED_MIME.includes(file.type)) {
      this.erro.set('Formato não suportado. Envie um arquivo PDF.');
      return;
    }
    if (file.size > MAX_BYTES) {
      this.erro.set(`Arquivo muito grande. Máximo ${formatBytes(MAX_BYTES)}.`);
      return;
    }

    this.uploading.set(true);
    this.erro.set(null);

    if (this._sessionPath) await this.deletarDoStorage(this._sessionPath);

    const path = `${this.prefix()}/${crypto.randomUUID()}.pdf`;
    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: 'application/pdf', upsert: false });

    this.uploading.set(false);

    if (error) {
      this.erro.set(error.message);
      return;
    }

    this._sessionPath = data.path;
    this.pathChange.emit({ storagePath: data.path, tamanhoBytes: file.size });

    this._inputRef().nativeElement.value = '';
  }

  protected async remover(): Promise<void> {
    if (this._sessionPath) {
      await this.deletarDoStorage(this._sessionPath);
      this._sessionPath = null;
    }
    this.pathChange.emit(null);
  }

  private async deletarDoStorage(path: string): Promise<void> {
    await this.supabase.storage.from(BUCKET).remove([path]);
  }
}
