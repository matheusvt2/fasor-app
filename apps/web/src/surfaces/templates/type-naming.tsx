import {
  blockTypeLabelIn,
  EMPTY_DEFINITION_CONTEXT,
  isCompanyBlockType,
  nodeTypesOf,
  quantityLabel,
  templateTypeVersionText,
  type BlockTypeKey,
  type DefinitionContext,
  type EquipmentBlockType,
} from '@app/domain';
import { createContext, useContext } from 'react';
import { copy } from '../../copy/pt-br.ts';

/*
 * Story 14.8: how the Template composer names an equipment type in its palette and its quantity
 * rows. A seeded type keeps its static name (`copy.composer.equipmentNames`); a company type is
 * named by its version's label and its stepper by its noun (the kernel's `quantityLabel` through
 * the company's definition context), and its row says the version the template records and the
 * newer one, or "Aposentado" (`templateTypeVersionText`). The composer provides the context once.
 */
export interface TypeNaming {
  definitions: DefinitionContext;
  seedVersion: string;
  /** The version each company type's placements record in this template (`type_version`). */
  recorded: ReadonlyMap<string, number>;
}

const SEEDED_ONLY: TypeNaming = { definitions: EMPTY_DEFINITION_CONTEXT, seedVersion: '', recorded: new Map() };

export const TypeNamingContext = createContext<TypeNaming>(SEEDED_ONLY);

export function useTypeNaming() {
  const naming = useContext(TypeNamingContext);
  return {
    definitions: naming.definitions,
    /** The types a node holds, seeded ones first, then company ones by label. */
    typesOf: (quantities: Readonly<Record<string, number>>) => nodeTypesOf(quantities, naming.definitions),
    nameOf: (type: BlockTypeKey) => (isCompanyBlockType(type) ? blockTypeLabelIn(naming.definitions, naming.seedVersion, type) : copy.composer.equipmentNames[type as EquipmentBlockType]),
    quantityLabelOf: (type: BlockTypeKey, n: number) => quantityLabel(type, n, naming.definitions),
    versionTextOf: (type: BlockTypeKey) => templateTypeVersionText(naming.definitions, type, naming.recorded.get(type)),
  };
}
