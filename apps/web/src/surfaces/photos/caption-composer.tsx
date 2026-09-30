import {
  captionUsarAnnouncement,
  captionChipOptions,
  dictatedText,
  captionPhotoLabel,
  captionPhotoMetaText,
  captionPartsOf,
  captionWordFor,
  composeCaption,
  type CaptionParts,
  type CaptionWord,
  type RegistryRow,
  type SeedWord,
} from '@app/domain';
import { useId, useRef, useState } from 'react';
import { Button as AriaButton, ToggleButton } from 'react-aria-components';
import { Button, Chip, Combobox, InactiveChip } from '../../components/index.ts';
import { DialogShell } from '../../components/dialog-shell.tsx';
import { SuggestionBlock } from '../../components/suggestion-field.tsx';
import { useObjectUrl } from '../../components/photo-row.tsx';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';
import type { CaptionRecents } from '../../db/photo-store.ts';
import { DictationButton } from '../../speech/dictation.tsx';
import './photos.css';

/*
 * Story 6.5 (FR-40; `71-legenda.html`, `key-photos.html` frame 3, EXPERIENCE.md › Caption
 * composer): opened only by "Legendar" / "Editar legenda", never by itself. Three rows --
 * Atividade · Equipamento · Local -- each a Chip row of the prefilled value, the recents and
 * the seed words ending in "Outro…" below 1280 px, a Combobox from 1280 px (CSS decides which
 * shows); the preview is the kernel's `composeCaption`, so the agreement is the context
 * caption's. "Editar texto" swaps the preview for free text that no chip regenerates.
 * "Salvar legenda" hands back the text (null when blank); the composer writes nothing itself
 * and never changes the photo's sheet.
 */

type Kind = keyof CaptionParts;

const KINDS: readonly Kind[] = ['atividade', 'equipamento', 'local'];

export interface CaptionComposerSources {
  /** The seed words: `atividades`, `locais`, plus the relatório's equipment words. */
  atividades: readonly SeedWord[];
  locais: readonly SeedWord[];
  equipamentos: readonly CaptionWord[];
  /** Extra Local names to offer after the recents (the relatório's cabines). */
  extraLocais: readonly string[];
  registry: readonly RegistryRow[];
  recents: CaptionRecents;
  /** Puts the saved parts first among this device's recents. */
  remember?: (parts: CaptionParts) => void;
}

/** E6-Q3: the one photo being captioned (`71-legenda.html` `.capture-preview`); a batch has none. */
export interface CaptionComposerPhoto {
  thumb: Blob | null;
  /** The provisional number, null before it has one. */
  number: number | null;
  capturedAt: string;
}

export interface CaptionComposerProps {
  isOpen: boolean;
  onClose: () => void;
  photo?: CaptionComposerPhoto;
  /** The parts the rows open on (`contextCaptionParts`). */
  prefill: CaptionParts;
  /** The caption stored now: when it is not what the parts compose, the composer opens in "Editar texto". */
  stored: string | null;
  sources: CaptionComposerSources;
  onSave: (text: string | null, parts: CaptionParts) => void;
  /**
   * Story 9.3: the photo's vision caption waiting for a tap (`71-legenda.html` `.vision-line`):
   * "Usar" confirms it (the caller's ops) and closes; saving a caption instead discards it.
   */
  suggestion?: { text: string; onUse: () => void };
}

/** A seed word as a caption part: its name and agreement only. */
function asWord(word: CaptionWord): CaptionWord {
  return { name: word.name, gender: word.gender, number: word.number };
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');
}

export function CaptionComposer(props: CaptionComposerProps) {
  const headingId = useId();
  return (
    <DialogShell
      className="caption-composer"
      overlayClassName="scrim-composer"
      isOpen={props.isOpen}
      onOpenChange={(open) => (open ? undefined : props.onClose())}
      aria-labelledby={headingId}
    >
      {props.isOpen ? <ComposerBody {...props} headingId={headingId} /> : null}
    </DialogShell>
  );
}

/** E6-Q3: the photo on top, as `71-legenda.html` draws it: the picture with its number badge, then its line. */
function PhotoPreview({ photo }: { photo: CaptionComposerPhoto }) {
  const src = useObjectUrl(photo.thumb);
  return (
    <div className="caption-photo">
      <div className="capture-preview" role="img" aria-label={captionPhotoLabel(photo.number)}>
        {src === null ? <span className="thumb-fake" /> : <img className="capture-preview-img" src={src} alt="" />}
        {photo.number === null ? null : (
          <span className="number-badge" aria-hidden="true">
            {photo.number}
          </span>
        )}
      </div>
      <div className="capture-meta">
        <span>{captionPhotoMetaText(photo.number, photo.capturedAt)}</span>
      </div>
    </div>
  );
}

function ComposerBody({ prefill, stored, sources, onSave, onClose, headingId, photo, suggestion }: CaptionComposerProps & { headingId: string }) {
  const t = copy.captionComposer;
  // The parts the stored caption was composed of (`captionPartsOf`): a caption composed at
  // capture with an activity the prefill no longer carries opens on the rows with that
  // activity chosen; one the rows cannot compose (typed by hand) opens as free text; no
  // caption opens on the prefill.
  const [opening] = useState<CaptionParts | null>(() =>
    captionPartsOf(stored, prefill, {
      atividades: sources.atividades.map(asWord),
      equipamentos: sources.equipamentos.map(asWord),
      locais: [
        ...sources.extraLocais.map((name) => captionWordFor(name, 'local', sources.locais, sources.registry)).filter((word): word is CaptionWord => word !== null),
        ...sources.locais.map(asWord),
      ],
    }),
  );
  const start = opening ?? prefill;
  const [parts, setParts] = useState<CaptionParts>(start);
  const generated = composeCaption(parts);
  const [editing, setEditing] = useState(() => opening === null);
  const [text, setText] = useState(() => stored ?? composeCaption(start) ?? '');
  // Story 9.4 (`71-legenda.html` 148-160): a dictated caption lands in the text as a suggestion;
  // "Salvar legenda" confirms it, typing makes it the engineer's own.
  const [dictated, setDictated] = useState(false);
  const textId = useId();
  const reasonId = useId();
  const area = useRef<HTMLTextAreaElement>(null);

  const wordFor = (kind: Kind, name: string): CaptionWord | null => {
    const opened = start[kind];
    if (opened !== null && sameName(opened.name, name)) return opened;
    const prefilled = prefill[kind];
    if (prefilled !== null && sameName(prefilled.name, name)) return prefilled;
    const words = kind === 'atividade' ? sources.atividades : kind === 'local' ? sources.locais : sources.equipamentos;
    return captionWordFor(name, kind, words, sources.registry);
  };

  const setPart = (kind: Kind, name: string | null) => {
    setParts((before) => ({ ...before, [kind]: name === null ? null : wordFor(kind, name) }));
  };

  const optionsOf = (kind: Kind): string[] => {
    const seed =
      kind === 'atividade'
        ? sources.atividades.map((word) => word.name)
        : kind === 'local'
          ? [...sources.extraLocais, ...sources.locais.map((word) => word.name)]
          : sources.equipamentos.map((word) => word.name);
    return captionChipOptions(prefill[kind]?.name ?? null, sources.recents[kind], seed, opening?.[kind]?.name ?? null);
  };

  const toggleEditing = (on: boolean) => {
    setEditing(on);
    setDictated(false);
    if (on) {
      // Free editing starts from the caption the rows compose now.
      setText(generated ?? '');
      requestAnimationFrame(() => area.current?.focus());
    }
  };

  const save = () => {
    const value = editing ? text : (generated ?? '');
    // Free text is not made of the chips: only a composed caption feeds the recents.
    if (!editing) sources.remember?.(parts);
    onSave(value.trim() === '' ? null : value.trim(), parts);
    onClose();
  };

  // E6-Q3 (`71-legenda.html`): the photo and the caption the rows compose come first (on a
  // phone they stay pinned while the chips scroll under them), then the rows, then the
  // Sticky action bar with "Salvar legenda", always in view.
  return (
    <>
      <div className="section-head">
        <h2 id={headingId}>{t.heading}</h2>
      </div>
      {suggestion === undefined ? null : (
        <SuggestionBlock
          className="vision-line"
          label={t.suggestedLabel}
          kicker={t.suggestedKicker}
          text={suggestion.text}
          confirmLabel={t.use}
          announcement={captionUsarAnnouncement(suggestion.text)}
          onConfirm={() => {
            suggestion.onUse();
            onClose();
          }}
        />
      )}
      <div className="caption-head">
        {photo === undefined ? null : <PhotoPreview photo={photo} />}
        <div
          className={dictated ? 'field suggestion-field caption-field' : 'field caption-field'}
          data-editing={editing ? '' : undefined}
          data-state={dictated ? 'suggested' : undefined}
        >
          <span className="field-label">{t.previewLabel}</span>
          {editing ? (
            <>
              <label className="visually-hidden" htmlFor={textId}>
                {t.textLabel}
              </label>
              <textarea
                id={textId}
                ref={area}
                className="observation-field caption-edit"
                value={text}
                aria-describedby={reasonId}
                onChange={(event) => {
                  setDictated(false);
                  setText(event.target.value);
                }}
              />
            </>
          ) : (
            <p className="caption-preview" role="status">
              {generated ?? ''}
            </p>
          )}
          {dictated ? <span className="suggested-pill">{ui.suggestionField.suggested}</span> : null}
          <div className="caption-actions">
            <ToggleButton className="btn btn-text caption-edit-toggle" isSelected={editing} onChange={toggleEditing}>
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-pencil" />
              </svg>
              {t.editText}
            </ToggleButton>
            {editing ? (
              <DictationButton
                className="caption-dictation"
                label={t.dictate}
                onResult={(heard) => {
                  const next = dictatedText(heard);
                  if (next === '') return;
                  setText(next);
                  setDictated(true);
                }}
              />
            ) : null}
            <span className="btn-reason" id={reasonId}>
              {t.editReason}
              {dictated ? <span className="dictated-note">{t.dictatedNote}</span> : null}
            </span>
          </div>
          {editing ? <p className="helper caption-edit-note">{t.editingNote}</p> : null}
        </div>
      </div>
      <p className="section-note">{t.note}</p>
      {KINDS.map((kind) => (
        <PartRow key={kind} kind={kind} options={optionsOf(kind)} value={parts[kind]?.name ?? null} onChange={(name) => setPart(kind, name)} inactive={editing} />
      ))}
      <div className="sticky-action-bar">
        <div className="bar-buttons">
          <Button variant="secondary" onPress={onClose}>
            {t.back}
          </Button>
          <Button variant="primary" onPress={save}>
            {t.save}
          </Button>
        </div>
      </div>
    </>
  );
}

/**
 * One row: chips below 1280 px, a Combobox from 1280 px (`photos.css`). `inactive` (E6-R2):
 * while "Editar texto" is on the caption is free text no chip regenerates, so every chip of
 * the row is shown `aria-disabled`, never pressed, and a tap does nothing.
 */
function PartRow({
  kind,
  options,
  value,
  onChange,
  inactive = false,
}: {
  kind: Kind;
  options: readonly string[];
  value: string | null;
  onChange: (name: string | null) => void;
  inactive?: boolean;
}) {
  const t = copy.captionComposer;
  const label = t[kind];
  const labelId = useId();
  const otherId = useId();
  const known = value === null || options.some((option) => sameName(option, value));
  const [other, setOther] = useState(!known);
  const otherInput = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState(known ? '' : (value ?? ''));
  const [query, setQuery] = useState(value ?? '');

  const comboOptions = options.map((option) => ({ id: option, label: option }));
  const selectedKey = value === null ? null : (options.find((option) => sameName(option, value)) ?? null);

  return (
    <div className="caption-part" data-kind={kind}>
      <div className="caption-chips">
        <span className="field-label" id={labelId}>
          {label}
        </span>
        <div className="chip-row chips-recent" role="group" aria-labelledby={labelId}>
          {options.map((option) => (
            <Chip
              key={option}
              isInactive={inactive}
              isSelected={!other && value !== null && sameName(option, value)}
              onSelectedChange={(selected) => {
                setOther(false);
                onChange(selected ? option : null);
              }}
            >
              {option}
            </Chip>
          ))}
          {inactive ? (
            <InactiveChip className="chip chip-other">{t.other}</InactiveChip>
          ) : (
            <ToggleButton
              className="chip chip-other"
              isSelected={other}
              onChange={(selected) => {
                setOther(selected);
                if (selected) {
                  onChange(typed.trim() === '' ? null : typed);
                  requestAnimationFrame(() => otherInput.current?.focus());
                } else {
                  onChange(null);
                }
              }}
            >
              {t.other}
            </ToggleButton>
          )}
        </div>
        {other ? (
          <div className="field">
            <label className="field-label" htmlFor={otherId}>
              {t.otherLabel[kind]}
            </label>
            <input
              id={otherId}
              ref={otherInput}
              className="input"
              value={typed}
              readOnly={inactive}
              onChange={(event) => {
                if (inactive) return;
                setTyped(event.target.value);
                onChange(event.target.value.trim() === '' ? null : event.target.value);
              }}
            />
          </div>
        ) : null}
      </div>
      <div className="caption-combo">
        <Combobox
          label={label}
          options={comboOptions}
          selectedKey={selectedKey}
          inputValue={query}
          isDisabled={inactive}
          {...(inactive ? { disabledReason: t.editingNote } : {})}
          onInputChange={(next) => {
            setQuery(next);
            onChange(next.trim() === '' ? null : next);
          }}
          onSelectionChange={(key) => {
            if (key === null) return;
            setQuery(key);
            onChange(key);
          }}
          onCreate={(typedValue) => {
            setQuery(typedValue);
            onChange(typedValue);
          }}
        />
      </div>
    </div>
  );
}

/** The chip trigger's own press, for a caller that renders "Legendar" outside a tile. */
export function LegendarButton({ onPress }: { onPress: () => void }) {
  return (
    <AriaButton className="btn btn-secondary btn-block" onPress={onPress}>
      <svg className="ico" aria-hidden="true">
        <use href="/sprite.svg#i-pencil" />
      </svg>
      {copy.captureSheet.caption}
    </AriaButton>
  );
}
