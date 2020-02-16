// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import React, { KeyboardEvent, RefObject } from "react";
import ReactDOM from "react-dom";
import {
    ContextualMenu,
    Customizer,
    FontIcon,
    IContextualMenuItem,
    ICustomizations,
} from "office-ui-fabric-react";
import { strings } from "../../../../common/strings";
import { getDarkTheme } from "../../../../common/themes";
import { AlignPortal } from "../align/alignPortal";
import { randomIntInRange } from "../../../../common/utils";
import { IRegion, ITag, ILabel, FieldType, FieldFormat } from "../../../../models/applicationState";
import { ColorPicker } from "../colorPicker";
import "./tagInput.scss";
import "../condensedList/condensedList.scss";
import TagInputItem, { ITagInputItemProps, ITagClickProps } from "./tagInputItem";
import TagInputToolbar from "./tagInputToolbar";
import { toast } from "react-toastify";
// tslint:disable-next-line:no-var-requires
const tagColors = require("../../common/tagColors.json");

export enum TagOperationMode {
    None,
    ColorPicker,
    ContextualMenu,
    Rename,
}

export interface ITagInputProps {
    /** Current list of tags */
    tags: ITag[];
    /** Function called on tags change */
    onChange: (tags: ITag[]) => void;
    /** Currently selected regions in canvas */
    selectedRegions?: IRegion[];
    /** The labels in the canvas */
    labels: ILabel[];
    /** Tags that are currently locked for editing experience */
    lockedTags?: string[];
    /** Updates to locked tags */
    onLockedTagsChange?: (locked: string[]) => void;
    /** Place holder for input text box */
    placeHolder?: string;
    /** Function to call on clicking individual tag */
    onTagClick?: (tag: ITag) => void;
    /** Function to call on clicking individual tag while holding CTRL key */
    onCtrlTagClick?: (tag: ITag) => void;
    /** Function to call when tag is renamed */
    onTagRenamed?: (oldTag: ITag, newTag: ITag) => void;
    /** Function to call when tag is deleted */
    onTagDeleted?: (tagName: string) => void;
    /** Always show tag input box */
    showTagInputBox?: boolean;
    /** Always show tag search box */
    showSearchBox?: boolean;
    /** Callback function for TagInputItemLabel mouse enter */
    onLabelEnter: (label: ILabel) => void;
    /** Callback function for TagInputItemLabel mouse leave */
    onLabelLeave: (label: ILabel) => void;
    /** Function to handle tag change */
    onTagChanged?: (oldTag: ITag, newTag: ITag) => void;
}

export interface ITagInputState {
    tags: ITag[];
    tagOperation: TagOperationMode;
    addTags: boolean;
    searchTags: boolean;
    searchQuery: string;
    selectedTag: ITag;
}

function defaultDOMNode(): Element {
    return document.createElement("div");
}

function filterFormat(type: FieldType): FieldFormat[] {
    switch (type) {
        case FieldType.String:
            return [
                FieldFormat.NotSpecified,
                FieldFormat.Alphanumberic,
                FieldFormat.NoWhiteSpaces,
            ];
        case FieldType.Number:
            return [
                FieldFormat.NotSpecified,
                FieldFormat.Currency,
            ];
        case FieldType.Integer:
            return [
                FieldFormat.NotSpecified,
            ];
        case FieldType.Date:
            return [
                FieldFormat.NotSpecified,
                FieldFormat.DMY,
                FieldFormat.MDY,
                FieldFormat.YMD,
            ];
        case FieldType.Time:
            return [
                FieldFormat.NotSpecified,
            ];
        default:
            return [ FieldFormat.NotSpecified ];
    }
}

export class TagInput extends React.Component<ITagInputProps, ITagInputState> {

    public state: ITagInputState = {
        tags: this.props.tags || [],
        tagOperation: TagOperationMode.None,
        addTags: this.props.showTagInputBox,
        searchTags: this.props.showSearchBox,
        searchQuery: "",
        selectedTag: null,
    };

    private tagItemRefs: Map<string, TagInputItem> = new Map<string, TagInputItem>();
    private headerRef = React.createRef<HTMLDivElement>();
    private inputRef = React.createRef<HTMLInputElement>();

    public componentDidUpdate(prevProps: ITagInputProps) {
        if (prevProps.tags !== this.props.tags) {
            let selectedTag = this.state.selectedTag;
            if (selectedTag) {
                selectedTag = this.props.tags.find((tag) => this.isNameEqual(tag, selectedTag));
            }

            this.setState({
                tags: this.props.tags,
                selectedTag,
            });
        }

        if (prevProps.selectedRegions !== this.props.selectedRegions && this.props.selectedRegions.length > 0) {
            this.setState({
                selectedTag: null,
            });
        }
    }

    public render() {
        const dark: ICustomizations = {
            settings: {
              theme: getDarkTheme(),
            },
            scopedSettings: {},
        };

        const { selectedTag } = this.state;
        const selectedTagRef = selectedTag ? this.tagItemRefs.get(selectedTag.name).getTagNameRef() : null;

        return (
            <div className="tag-input">
                <div ref={this.headerRef} className="tag-input-header p-2">
                    <span className="tag-input-title">{strings.tags.title}</span>
                    <TagInputToolbar
                        selectedTag={this.state.selectedTag}
                        onAddTags={() => this.setState({ addTags: !this.state.addTags })}
                        onSearchTags={() => this.setState({
                            searchTags: !this.state.searchTags,
                            searchQuery: "",
                        })}
                        onEditTag={this.onEditTag}
                        onLockTag={this.onLockTag}
                        onDelete={this.deleteTag}
                        onReorder={this.onReOrder}
                    />
                </div>
                <div className="tag-input-body">
                    {
                        this.state.searchTags &&
                        <div className="tag-input-text-input-row search-input">
                            <input
                                className="tag-search-box"
                                type="text"
                                onKeyDown={this.onSearchKeyDown}
                                onChange={(e) => this.setState({ searchQuery: e.target.value })}
                                placeholder="Search tags"
                                autoFocus={true}
                            />
                            <FontIcon iconName="Search" />
                        </div>
                    }
                    <div className="tag-input-items">
                        {this.renderTagItems()}
                        <Customizer {...dark}>
                            <ContextualMenu
                                className="tag-input-contextual-menu"
                                items={this.getContextualMenuItems()}
                                hidden={!selectedTagRef || this.state.tagOperation !== TagOperationMode.ContextualMenu}
                                target={selectedTagRef}
                                onDismiss={this.onHideContextualMenu}
                            />
                        </Customizer>
                        {this.getColorPickerPortal()}
                    </div>
                    {
                        this.state.addTags &&
                        <div className="tag-input-text-input-row new-tag-input">
                            <input
                                className="tag-input-box"
                                type="text"
                                onKeyDown={this.onAddTagKeyDown}
                                // Add mouse event
                                onBlur={this.onAddTagWithBlur}
                                placeholder="Add new tag"
                                autoFocus={true}
                                ref={this.inputRef}
                            />
                            <FontIcon iconName="Tag" />
                        </div>
                    }
                </div>
            </div>
        );
    }

    public triggerNewTagBlur() {
        if (this.inputRef.current) {
            this.inputRef.current.blur();
        }
    }

    private onEditTag = (tag: ITag) => {
        const tagOperation = this.state.tagOperation === TagOperationMode.Rename
            ? TagOperationMode.None : TagOperationMode.Rename;
        this.setState({
            tagOperation,
        });
    }

    private onLockTag = (tag: ITag) => {
        if (!tag) {
            return;
        }
        let lockedTags = [...this.props.lockedTags];
        if (lockedTags.find((str) => this.isNameEqualTo(tag, str))) {
            lockedTags = lockedTags.filter((str) => !this.isNameEqualTo(tag, str));
        } else {
            lockedTags.push(tag.name);
        }
        this.props.onLockedTagsChange(lockedTags);
    }

    private onReOrder = (tag: ITag, displacement: number) => {
        if (!tag) {
            return;
        }
        const tags = [...this.state.tags];
        const currentIndex = tags.indexOf(tag);
        const newIndex = currentIndex + displacement;
        if (newIndex < 0 || newIndex >= tags.length) {
            return;
        }
        tags.splice(currentIndex, 1);
        tags.splice(newIndex, 0, tag);
        this.setState({
            tags,
        }, () => this.props.onChange(tags));
    }

    private handleColorChange = (color: string) => {
        const tag = this.state.selectedTag;
        const tags = this.state.tags.map((t) => {
            return (this.isNameEqual(t, tag)) ? {
                ...tag,
                color,
            } : t;
        });
        this.setState({
            tags,
            tagOperation: TagOperationMode.None,
        }, () => this.props.onChange(tags));
    }

    private addTag = (tag: ITag) => {
        try {
            this.validateTagLength(tag);
            this.validateTagUniqness(tag, this.state.tags);
        } catch (error) {
            toast.warn(error.toString());
            return;
        }

        const tags = [...this.state.tags, tag];
        this.setState({
            tags,
        }, () => this.props.onChange(tags));
    }

    private updateTag = (tag: ITag, newTag: ITag) => {
        if ((this.isNameEqual(tag, newTag)) && tag.color === newTag.color) {
            return;
        }

        try {
            const tagsWithoutOldTag = this.state.tags.filter((elem) => !this.isNameEqual(elem, tag));
            this.validateTagLength(newTag);
            this.validateTagUniqness(newTag, tagsWithoutOldTag);
        } catch (error) {
            toast.warn(error.toString());
            return;
        }

        const nameChanged = !this.isNameEqual(tag, newTag);
        if (nameChanged && this.props.onTagRenamed) {
           this.props.onTagRenamed(tag, newTag);
           return;
        }

        const tags = this.state.tags.map((t) => {
            return (this.isNameEqual(t, tag)) ? newTag : t;
        });
        this.setState({
            tags,
            selectedTag: newTag,
        }, () => {
            this.props.onChange(tags);
        });
    }

    private deleteTag = (tag: ITag) => {
        if (!tag) {
            return;
        }
        this.props.onTagDeleted(tag.name);
    }

    private getColorPickerPortal = () => {
        const { selectedTag } = this.state;
        const showColorPicker = this.state.tagOperation === TagOperationMode.ColorPicker;
        return (
            <AlignPortal align={{points: [ "tr", "tl" ]}} target={() => this.headerRef.current}>
                <div className="tag-input-colorpicker-container">
                    {
                        showColorPicker &&
                        <ColorPicker
                            color={selectedTag && selectedTag.color}
                            colors={tagColors}
                            onEditColor={this.handleColorChange}
                            show={showColorPicker}
                        />
                    }
                </div>
            </AlignPortal>
        );
    }

    private renderTagItems = () => {
        let props = this.createTagItemProps();
        const query = this.state.searchQuery;
        this.tagItemRefs.clear();

        if (query.length) {
            props = props.filter((prop) => prop.tag.name.toLowerCase().includes(query.toLowerCase()));
        }

        return props.map((prop) =>
            <TagInputItem
                {...prop}
                key={prop.tag.name}
                labels={this.setTagLabels(prop.tag.name)}
                ref={(item) => this.setTagItemRef(item, prop.tag)}
                onLabelEnter={this.props.onLabelEnter}
                onLabelLeave={this.props.onLabelLeave}
                onTagChanged={this.props.onTagChanged}
            />);
    }

    private setTagItemRef = (item: TagInputItem, tag: ITag) => {
        this.tagItemRefs.set(tag.name, item);
        return item;
    }

    private setTagLabels = (key: string): ILabel[] => {
        return this.props.labels.filter((label) => label.label === key);
    }

    private createTagItemProps = (): ITagInputItemProps[] => {
        const { tags, selectedTag, tagOperation } = this.state;
        const selectedRegionTagSet = this.getSelectedRegionTagSet();

        return tags.map((tag) => (
            {
                tag,
                index: tags.findIndex((t) => this.isNameEqual(t, tag)),
                isLocked: this.props.lockedTags
                    && this.props.lockedTags.findIndex((str) => this.isNameEqualTo(tag, str)) > -1,
                isRenaming: selectedTag && this.isNameEqual(selectedTag, tag)
                    && tagOperation === TagOperationMode.Rename,
                isSelected: selectedTag && this.isNameEqual(this.state.selectedTag, tag),
                appliedToSelectedRegions: selectedRegionTagSet.has(tag.name),
                onClick: this.onTagItemClick,
                onChange: this.updateTag,
            } as ITagInputItemProps
        ));
    }

    private getSelectedRegionTagSet = (): Set<string> => {
        const result = new Set<string>();
        if (this.props.selectedRegions) {
            for (const region of this.props.selectedRegions) {
                for (const tag of region.tags) {
                    result.add(tag);
                }
            }
        }
        return result;
    }

    private onTagItemClick = (tag: ITag, props: ITagClickProps) => {
        if (props.ctrlKey && this.props.onCtrlTagClick) { // Lock tags
            this.props.onCtrlTagClick(tag);
        } else if (props.altKey) { // Edit tag
            this.setState({
                selectedTag: tag,
                tagOperation: TagOperationMode.Rename,
            });
        } else if (props.clickedDropDown) {
            const { selectedTag } = this.state;
            const showContextualMenu = !selectedTag || !this.isNameEqual(selectedTag, tag)
                || this.state.tagOperation !== TagOperationMode.ContextualMenu;
            const tagOperation = showContextualMenu ? TagOperationMode.ContextualMenu : TagOperationMode.None;
            this.setState({
                selectedTag: tag,
                tagOperation,
            });
        } else if (props.clickedColor) {
            const { selectedTag, tagOperation } = this.state;
            const showColorPicker = tagOperation !== TagOperationMode.ColorPicker;
            const newTagOperation = showColorPicker ? TagOperationMode.ColorPicker : TagOperationMode.None;
            this.setState({
                selectedTag: showColorPicker ? tag : selectedTag,
                tagOperation: newTagOperation,
            });
        } else { // Select tag
            const { selectedTag, tagOperation: oldTagOperation } = this.state;
            const selected = selectedTag && this.isNameEqual(selectedTag, tag);
            const tagOperation = selected ? oldTagOperation : TagOperationMode.None;
            let deselect = selected && oldTagOperation === TagOperationMode.None;

            // Only fire click event if a region is selected
            if (this.props.selectedRegions &&
                this.props.selectedRegions.length > 0 &&
                this.props.onTagClick) {
                deselect = false;
                this.props.onTagClick(tag);
            }

            this.setState({
                selectedTag: deselect ? null : tag,
                tagOperation,
            });

       }
    }

    private onSearchKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            this.setState({
                searchTags: false,
            });
        }
    }

    private onAddTagKeyDown = (event) => {
        // Add handle mouse event functionality
        if (event.key === "Enter") {
            // validate and add
            this.creatTagInput(event.target.value.trim());
            event.target.value = "";
        }
        if (event.key === "Escape") {
            this.setState({
                addTags: false,
            });
        }
    }

    private onAddTagWithBlur = (event: any) => {
        if (event.target.value) {
            this.creatTagInput(event.target.value.trim());
            event.target.value = "";
        }
    }

    private creatTagInput = (value: any) => {
        const newTag: ITag = {
                name: value,
                color: this.getNextColor(),
                type: FieldType.String,
                format: FieldFormat.NotSpecified,
        };
        if (newTag.name.length && ![...this.state.tags, newTag].containsDuplicates((t) => t.name)) {
            this.addTag(newTag);
        } else if (!newTag.name.length) {
            toast.warn(strings.tags.warnings.emptyName);
        } else {
            toast.warn(strings.tags.warnings.existingName);
        }
    }

    private getNextColor = () => {
        const tags = this.state.tags;

        for (const color of tagColors) {
            let vacancy = true;
            for (const tag of tags) {
                if (color.toLowerCase() === tag.color.toLowerCase()) {
                    vacancy = false;
                    break;
                }
            }
            if (vacancy) {
                return color;
            }
        }

        return tagColors[randomIntInRange(0, tagColors.length - 1)];
    }

    private validateTagLength = (tag: ITag) => {
        if (!tag.name.trim().length) {
            throw new Error(strings.tags.warnings.emptyName);
        }
        if (tag.name.length >= 128) {
            throw new Error("Tag name is too long (>= 128).");
        }
    }

    private validateTagUniqness = (tag: ITag, tags: ITag[]) => {
        if (tags.some((t) => this.isNameEqual(t, tag))) {
            throw new Error(strings.tags.warnings.existingName);
        }
    }

    private isNameEqual = (t: ITag, u: ITag) => {
        return t.name.trim().toLocaleLowerCase() === u.name.trim().toLocaleLowerCase();
    }

    private isNameEqualTo = (tag: ITag, str: string) => {
        return tag.name.trim().toLocaleLowerCase() === str.trim().toLocaleLowerCase();
    }

    private onHideContextualMenu = () => {
        this.setState({tagOperation: TagOperationMode.None});
    }

    private getContextualMenuItems = (): IContextualMenuItem[] => {
        const tag = this.state.selectedTag;
        if (!tag) {
            return [];
        }

        const menuItems: IContextualMenuItem[] = [
            {
                key: "type",
                iconProps: {
                    iconName: "Link",
                },
                text: tag.type ? tag.type : strings.tags.toolbar.type,
                subMenuProps: {
                    items: this.getTypeSubMenuItems(),
                },
            },
            {
                key: "format",
                iconProps: {
                    iconName: "Link",
                },
                text: tag.format ? tag.format : strings.tags.toolbar.format,
                subMenuProps: {
                    items: this.getFormatSubMenuItems(),
                },
            },
        ];

        return menuItems;
    }

    private getTypeSubMenuItems = (): IContextualMenuItem[] => {
        const tag = this.state.selectedTag;
        const types = Object.values(FieldType);

        return types.map((type) => {
            return {
                key: type,
                text: type,
                canCheck: true,
                isChecked: type === tag.type,
                onClick: this.onTypeSelect,
            } as IContextualMenuItem;
        });
    }

    private getFormatSubMenuItems = (): IContextualMenuItem[] => {
        const tag = this.state.selectedTag;
        const formats = filterFormat(tag.type);

        return formats.map((format) => {
            return {
                key: format,
                text: format,
                canCheck: true,
                isChecked: format === tag.format,
                onClick: this.onFormatSelect,
            } as IContextualMenuItem;
        });
    }

    private onTypeSelect = (event: React.MouseEvent<HTMLButtonElement>, item?: IContextualMenuItem): void => {
        event.preventDefault();
        const type = item.text as FieldType;
        const tag = this.state.selectedTag;
        if (type === tag.type) {
            return;
        }

        const newTag = {
            ...tag,
            type,
            format: FieldFormat.NotSpecified,
        };

        if (this.props.onTagChanged) {
            this.props.onTagChanged(tag, newTag);
        }
    }

    private onFormatSelect = (event: React.MouseEvent<HTMLButtonElement>, item?: IContextualMenuItem): void => {
        event.preventDefault();
        const format = item.text as FieldFormat;
        const tag = this.state.selectedTag;
        if (format === tag.format) {
            return;
        }

        const newTag = {
            ...tag,
            format,
        };

        if (this.props.onTagChanged) {
            this.props.onTagChanged(tag, newTag);
        }
    }
}
