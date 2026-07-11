import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Image, Loader } from 'lucide-angular';
import { SupabaseService } from '../../../core/services/supabase.service';
import { compressImage } from '../../../core/utils/image-compress.util';
import { UiIconComponent } from '../ui/icon/ui-icon.component';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'];

@Component({
  selector: 'app-image-upload',
  standalone: true,
  imports: [UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="img-upload">
      @if (previewUrl()) {
        <div class="img-preview">
          <img
            [src]="previewUrl()!"
            alt="Pré-visualização"
            class="img-preview__img"
          />
          <div class="img-preview__actions">
            <button
              type="button"
              class="img-btn img-btn--secondary"
              [disabled]="uploading()"
              (click)="abrirSeletor()"
            >
              Trocar
            </button>
            <button
              type="button"
              class="img-btn img-btn--danger"
              [disabled]="uploading()"
              (click)="remover()"
            >
              Remover
            </button>
          </div>
        </div>
      } @else {
        <button
          type="button"
          class="img-dropzone"
          [disabled]="uploading()"
          (click)="abrirSeletor()"
        >
          @if (uploading()) {
            <span class="img-dropzone__icon"><app-ui-icon [icon]="iconLoader" [size]="24" /></span>
            <span>Enviando…</span>
          } @else {
            <span class="img-dropzone__icon"><app-ui-icon [icon]="iconImage" [size]="24" /></span>
            <span class="img-dropzone__label">Clique para adicionar imagem</span>
            <span class="img-dropzone__hint">PNG, JPG ou WebP · máx 5 MB</span>
          }
        </button>
      }

      @if (erroUpload()) {
        <p class="img-error">{{ erroUpload() }}</p>
      }

      <input
        #arquivoInput
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style="display:none"
        (change)="onFileSelected($event)"
      />
    </div>

    <style>
      .img-upload { display: flex; flex-direction: column; gap: 0.5rem; }

      .img-dropzone {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 0.25rem; padding: 1.5rem; border: 2px dashed var(--color-border);
        border-radius: 10px; background: var(--color-surface-2); cursor: pointer;
        width: 100%; text-align: center; transition: border-color 0.15s, background 0.15s;
        font-family: inherit;
      }
      .img-dropzone:hover:not(:disabled) { border-color: var(--color-primary-light); background: #eff6ff; }
      .img-dropzone:disabled { opacity: 0.6; cursor: not-allowed; }
      .img-dropzone__icon { font-size: 1.5rem; }
      .img-dropzone__label { font-size: 0.875rem; font-weight: 500; color: var(--color-text); }
      .img-dropzone__hint { font-size: 0.75rem; color: var(--color-text-muted); }

      .img-preview { display: flex; flex-direction: column; gap: 0.5rem; }
      .img-preview__img {
        max-height: 300px; width: auto; max-width: 100%;
        display: block; margin: 0 auto; border-radius: 8px; object-fit: contain;
        border: 1px solid var(--color-border);
      }
      .img-preview__actions { display: flex; gap: 0.5rem; justify-content: center; }

      .img-btn {
        padding: 0.375rem 0.875rem; border-radius: 6px; font-size: 0.8125rem; font-weight: 500;
        cursor: pointer; border: 1px solid transparent; font-family: inherit;
        transition: background 0.15s, border-color 0.15s;
      }
      .img-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .img-btn--secondary {
        background: var(--color-surface); border-color: var(--color-border); color: var(--color-text);
      }
      .img-btn--secondary:hover:not(:disabled) { background: var(--color-surface-2); }
      .img-btn--danger { background: #fee2e2; color: #b91c1c; border-color: #fca5a5; }
      .img-btn--danger:hover:not(:disabled) { background: #fecaca; }

      .img-error { font-size: 0.8125rem; color: #b91c1c; margin: 0; }
    </style>
  `,
})
export class ImageUploadComponent {
  private readonly supabase = inject(SupabaseService).client;

  protected readonly iconLoader = Loader;
  protected readonly iconImage = Image;

  readonly currentUrl = input<string | null>(null);
  readonly bucket = input<string>('questao-imagens');
  readonly pathPrefix = input<string>('questoes');
  readonly urlChange = output<string | null>();

  protected readonly uploading = signal(false);
  protected readonly erroUpload = signal<string | null>(null);

  /** URL do arquivo enviado nesta sessão de edição (nunca a currentUrl original) */
  private _sessionUrl: string | null = null;

  /** URL exibida: upload local tem prioridade sobre currentUrl */
  private readonly _localUrl = signal<string | null | undefined>(undefined);
  protected readonly previewUrl = computed(() => {
    const local = this._localUrl();
    return local !== undefined ? local : this.currentUrl();
  });

  private readonly _inputRef = viewChild.required<ElementRef<HTMLInputElement>>('arquivoInput');

  constructor() {
    // Se o pai trocar a currentUrl para um valor diferente do estado local
    // (ex.: carrossel do editor navegou para outro card reutilizando este
    // componente), o estado da sessão anterior deve ser descartado — senão a
    // imagem do card anterior "vaza" para o novo.
    effect(() => {
      const url = this.currentUrl();
      if (this._localUrl() !== undefined && url !== this._localUrl()) {
        this._localUrl.set(undefined);
        this._sessionUrl = null;
        this.erroUpload.set(null);
      }
    });
  }

  protected abrirSeletor(): void {
    this._inputRef().nativeElement.click();
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (!ALLOWED_MIME.includes(file.type)) {
      this.erroUpload.set('Formato não suportado. Use PNG, JPG ou WebP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      this.erroUpload.set('Arquivo muito grande. Máximo 5 MB.');
      return;
    }

    this.uploading.set(true);
    this.erroUpload.set(null);

    // Só deleta upload anterior *desta sessão*, nunca a currentUrl original
    if (this._sessionUrl) await this.deletarDoStorage(this._sessionUrl);

    // Comprimir imagem antes do upload
    let processedFile: File;
    try {
      processedFile = await compressImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.82 });
    } catch {
      processedFile = file;
    }

    const path = `${this.pathPrefix()}/${crypto.randomUUID()}.webp`;
    const { data, error } = await this.supabase.storage.from(this.bucket()).upload(path, processedFile, {
      contentType: processedFile.type,
    });

    this.uploading.set(false);

    if (error) {
      this.erroUpload.set(error.message);
      return;
    }

    const { data: { publicUrl } } = this.supabase.storage.from(this.bucket()).getPublicUrl(data.path);
    this._sessionUrl = publicUrl;
    this._localUrl.set(publicUrl);
    this.urlChange.emit(publicUrl);

    // limpa o input para permitir re-selecionar o mesmo arquivo
    this._inputRef().nativeElement.value = '';
  }

  protected async remover(): Promise<void> {
    if (this._sessionUrl) {
      await this.deletarDoStorage(this._sessionUrl);
      this._sessionUrl = null;
    }
    this._localUrl.set(null);
    this.urlChange.emit(null);
  }

  private async deletarDoStorage(url: string): Promise<void> {
    const marker = `/object/public/${this.bucket()}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    const path = url.substring(idx + marker.length);
    await this.supabase.storage.from(this.bucket()).remove([path]);
  }
}
