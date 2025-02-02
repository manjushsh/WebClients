import {
    ComponentPropsWithoutRef,
    KeyboardEvent,
    MutableRefObject,
    ReactElement,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import { Dropdown } from '../dropdown';
import Option, { Props as OptionProps } from '../option/Option';
import SelectButton from './SelectButton';
import SelectOptions from './SelectOptions';
import { SelectChangeEvent } from './select';
import useSelect, { SelectProvider } from './useSelect';

export interface Props<V>
    extends Omit<ComponentPropsWithoutRef<'button'>, 'value' | 'onClick' | 'onChange' | 'onKeyDown' | 'aria-label'> {
    value?: V;
    /**
     * Optionally allows to remove the border around the select. Use for example in inputs
     */
    unstyled?: boolean;
    /**
     * Optionally allows controlling the Select's open state
     */
    isOpen?: boolean;
    /**
     * Children Options of the Select, have to be of type Option
     * (or something that implements the same interface)
     */
    children: ReactElement<OptionProps<V>>[];
    /**
     * Milliseconds after which to clear the current user input
     * (the input is used for highlighting match based on keyboard input)
     */
    clearSearchAfter?: number;
    /**
     * In case you're providing complex values to your options, you can
     * provide a function to return a string given one of your complex
     * value items. This is optional however if you do not provide it and
     * your values are complex, the search feature will be disabled for
     * that instance of the Select.
     */
    getSearchableValue?: (value: V) => string;
    noMaxWidth?: boolean;
    originalPlacement?: string;
    loading?: boolean;
    onChange?: (e: SelectChangeEvent<V>) => void;
    onValue?: (value: V) => void;
    onClose?: () => void;
    onOpen?: () => void;
    anchorRef?: MutableRefObject<HTMLButtonElement | null>;
}

const SelectTwo = <V extends any>({
    unstyled,
    children,
    value,
    placeholder,
    isOpen: controlledOpen,
    onClose,
    onOpen,
    onChange,
    onValue,
    clearSearchAfter = 500,
    getSearchableValue,
    noMaxWidth = true,
    originalPlacement,
    loading,
    anchorRef: maybeAnchorRef,
    ...rest
}: Props<V>) => {
    const anchorRef = useRef<HTMLButtonElement | null>(null);

    const [search, setSearch] = useState('');

    const searchClearTimeout = useRef<number | undefined>(undefined);

    const optionChildren = children.filter((child) => child.type === Option);
    const optionValues = optionChildren.map((child) => child.props.value);

    const select = useSelect({
        value,
        options: optionValues,
        onChange,
        onValue,
        onOpen,
        onClose,
    });

    const { isOpen, selectedIndex, open, close, setFocusedIndex, handleChange } = select;

    /*
     * Natural search-ability determined by whether or not all option values
     * from the passed children are strings, there's also "unnatural" search-
     * ability if the prop "getSearchableValue" is passed
     *
     * Another valid condition for the natural search-ability of the options
     * is whether or not they all have a "title" attribute
     */
    const [allOptionChildrenAreStrings, allOptionsHaveTitles] = useMemo(
        () => [
            children.every((child) => typeof child.props.children === 'string'),
            children.every((child) => Boolean(child.props.title)),
        ],
        [children]
    );

    const isNaturallySearchable = allOptionChildrenAreStrings || allOptionsHaveTitles;

    const isSearchable = isNaturallySearchable || Boolean(getSearchableValue);

    const searchableItems = useMemo(() => {
        if (isNaturallySearchable) {
            return allOptionChildrenAreStrings
                ? (children.map((child) => child.props.children) as string[])
                : children.map((child) => child.props.title);
        }

        if (getSearchableValue) {
            return optionValues.map(getSearchableValue);
        }

        return [];
    }, [allOptionChildrenAreStrings, children]);

    useEffect(() => {
        if (!search || !isSearchable) {
            return;
        }

        window.clearTimeout(searchClearTimeout.current);

        searchClearTimeout.current = window.setTimeout(() => {
            setSearch('');
        }, clearSearchAfter);

        const indexOfMatchedOption = searchableItems.findIndex((v) => v.startsWith(search));

        if (indexOfMatchedOption !== -1) {
            if (isOpen) {
                setFocusedIndex(indexOfMatchedOption);
            } else {
                const matchedValue = optionValues[indexOfMatchedOption];
                onChange?.({
                    value: matchedValue,
                    selectedIndex: indexOfMatchedOption,
                });
                onValue?.(matchedValue);
            }
        }
    }, [search]);

    const handleAnchorClick = () => {
        if (isOpen) {
            close();
        } else {
            open();
        }
    };

    const handleKeydown = (e: KeyboardEvent<HTMLElement>) => {
        const { key } = e;

        if (key === 'Escape') {
            close();
            anchorRef.current?.focus();
            return;
        }

        if (key === ' ') {
            open();
            return;
        }

        const isAlphanumeric = /^[A-Za-z0-9]$/.test(key);

        if (isAlphanumeric && isSearchable) {
            setSearch((s) => s + key);
        }
    };

    const selectedChild = selectedIndex || selectedIndex === 0 ? optionChildren[selectedIndex] : null;

    const displayedValue = selectedChild?.props?.children || selectedChild?.props?.title || placeholder;

    const ariaLabel = selectedChild?.props?.title;

    return (
        <SelectProvider {...select}>
            <SelectButton
                unstyled={unstyled}
                isOpen={isOpen}
                onOpen={open}
                onClick={handleAnchorClick}
                onKeyDown={handleKeydown}
                aria-label={ariaLabel}
                ref={anchorRef}
                {...rest}
            >
                {displayedValue}
            </SelectButton>

            <Dropdown
                isOpen={isOpen}
                anchorRef={maybeAnchorRef || anchorRef}
                onClose={close}
                offset={4}
                noCaret
                noMaxWidth={noMaxWidth}
                originalPlacement={originalPlacement}
                sameAnchorWidth
                disableDefaultArrowNavigation
            >
                <SelectOptions selected={selectedIndex} onKeyDown={handleKeydown} onChange={handleChange}>
                    {children}
                </SelectOptions>
            </Dropdown>
        </SelectProvider>
    );
};

export default SelectTwo;
