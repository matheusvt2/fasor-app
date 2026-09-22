import { ui } from '../../copy/ui.ts';

/**
 * The shared placeholder body for a Registries tab that has no real surface yet
 * (Empresa, Clientes, Fabricantes, Classes de tensão, Critérios — Stories 2.2-2.6). Each
 * tab file renders this with its own heading, so a later story replaces only its own
 * file's contents (Code Map).
 */
export function RegistryTabPlaceholder({ heading }: { heading: string }) {
  return (
    <div className="registry-main is-narrow">
      <h2>{heading}</h2>
      <p className="section-note">{ui.registryTabPlaceholder.text}</p>
    </div>
  );
}
