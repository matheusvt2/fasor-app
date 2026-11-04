import type { PointLinkGroup } from '@app/domain';
import { Button, Header, Label, ListBox, ListBoxItem, ListBoxSection, Popover, Select, SelectValue, type Key } from 'react-aria-components';
import { copy } from '../../copy/pt-br.ts';

/*
 * Story 20.4: "Equipamento ou local" in the point editor, a React Aria Select over the
 * kernel's groups (`pointLinkGroups`): "Geral" first, then each local with its equipment, then
 * the equipment of no local, each by TAG, type and place as the photo capture names it. The
 * box is the mock's `.field.combobox` with an `.input` trigger and the `.combobox-chevron`; the
 * list is `.combobox-list` with `.combobox-option` rows, one `ListBoxSection` per group. The
 * Select gives the focus back to the trigger after a choice; the pick itself is the editor's.
 */
export function PointLinkPicker({
  groups,
  selectedKey,
  onPick,
}: {
  groups: readonly PointLinkGroup[];
  /** The option the point names now (`pointLinkKey`). */
  selectedKey: string;
  onPick: (key: string) => void;
}) {
  return (
    <Select
      className="field combobox poa-link"
      selectedKey={selectedKey}
      onSelectionChange={(key: Key | null) => {
        if (key !== null && String(key) !== selectedKey) onPick(String(key));
      }}
    >
      <Label className="field-label">{copy.points.linkLabel}</Label>
      <Button className="input poa-link-trigger">
        <SelectValue className="poa-link-value" />
        <span className="combobox-chevron" aria-hidden="true">
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-chev-down" />
          </svg>
        </span>
      </Button>
      <Popover className="combobox-list poa-link-list">
        <ListBox>
          {groups.map((group) => (
            <ListBoxSection key={group.id} id={group.id} className="poa-link-group">
              {group.label === null ? null : <Header className="poa-link-group-label">{group.label}</Header>}
              {group.options.map((option) => (
                <ListBoxItem key={option.key} id={option.key} className="combobox-option" textValue={option.text}>
                  {option.text}
                </ListBoxItem>
              ))}
            </ListBoxSection>
          ))}
        </ListBox>
      </Popover>
    </Select>
  );
}
