import { useEffect, useState } from 'react';

import { Location } from 'history';

import {
    FeatureCode,
    TopNavbarListItemSearchButton,
    generateUID,
    useAddresses,
    useFeatures,
    useFolders,
    useLabels,
    useMailSettings,
    usePopperAnchor,
    useToggle,
    useUser,
} from '@proton/components';
import { isMobile } from '@proton/shared/lib/helpers/browser';
import { isPaid } from '@proton/shared/lib/user/helpers';

import { ADVANCED_SEARCH_OVERLAY_CLOSE_EVENT } from '../../../constants';
import { useEncryptedSearchContext } from '../../../containers/EncryptedSearchProvider';
import { extractSearchParameters } from '../../../helpers/mailboxUrl';
import { useClickMailContent } from '../../../hooks/useClickMailContent';
import { Breakpoints } from '../../../models/utils';
import useEncryptedSearchToggleState from '../useEncryptedSearchToggleState';
import AdvancedSearch from './AdvancedSearch';
import MailSearchInput from './MailSearchInput';
import MailSearchSpotlight from './MailSearchSpotlight';
import SearchOverlay from './SearchOverlay';

import './Search.scss';

interface Props {
    breakpoints: Breakpoints;
    labelID: string;
    location: Location;
}

const MailSearch = ({ breakpoints, labelID, location }: Props) => {
    const [uid] = useState(generateUID('advanced-search-overlay'));
    const { anchorRef, isOpen, open, close } = usePopperAnchor<HTMLInputElement>();
    const searchParams = extractSearchParameters(location);
    const [searchInputValue, setSearchInputValue] = useState(searchParams.keyword || '');
    const [user] = useUser();
    const [, loadingMailSettings] = useMailSettings();
    const [, loadingLabels] = useLabels();
    const [, loadingFolders] = useFolders();
    const [, loadingAddresses] = useAddresses();
    const [{ loading: loadingScheduledFeature }, { feature: partialES }] = useFeatures([
        FeatureCode.ScheduledSend,
        FeatureCode.PartialEncryptedSearch,
    ]);
    const { getESDBStatus, cacheOrIndexMetadata, closeDropdown } = useEncryptedSearchContext();
    const { dropdownOpened, dbExists } = getESDBStatus();
    const esState = useEncryptedSearchToggleState(isOpen);

    const showEncryptedSearch = !isMobile() && (!!isPaid(user) || (!!partialES && partialES.Value));

    // Show more from inside AdvancedSearch to persist the state when the overlay is closed
    const { state: showMore, toggle: toggleShowMore } = useToggle(false);
    // Show a loader between the time the user interacts with the ES CTA (i.e. the "Activate"
    // button) and when metadata indexing is over. Set back to false in case the ESDB is removed
    const [esInteraction, setESInteraction] = useState<boolean>(false);
    const handleESInteraction = async () => {
        setESInteraction(() => true);
    };
    useEffect(() => {
        if (!dbExists) {
            setESInteraction(() => false);
        }
    }, [dbExists]);

    const loading =
        loadingLabels || loadingFolders || loadingMailSettings || loadingAddresses || loadingScheduledFeature;

    useEffect(() => {
        if (!isOpen) {
            closeDropdown();
        }
    }, [isOpen]);

    useEffect(() => {
        if (dropdownOpened) {
            open();
        }
    }, [dropdownOpened]);

    useEffect(() => {
        setSearchInputValue(searchParams?.keyword || '');
    }, [location]);

    useClickMailContent(() => {
        close();
    });

    const handleOpen = () => {
        if (isOpen) {
            return;
        }

        if (!loading) {
            anchorRef.current?.blur();
            void cacheOrIndexMetadata();
            open();
        }
    };

    // Listen to close events from composer or iframes
    useEffect(() => {
        document.addEventListener('dropdownclose', close);
        document.addEventListener(ADVANCED_SEARCH_OVERLAY_CLOSE_EVENT, close);

        return () => {
            document.removeEventListener('dropdownclose', close);
            document.removeEventListener(ADVANCED_SEARCH_OVERLAY_CLOSE_EVENT, close);
        };
    }, [close]);

    return (
        <>
            <MailSearchSpotlight canShow={showEncryptedSearch && !isOpen}>
                {breakpoints.isNarrow ? (
                    <TopNavbarListItemSearchButton onClick={handleOpen} />
                ) : (
                    <MailSearchInput
                        ref={anchorRef}
                        value={searchInputValue}
                        onChange={setSearchInputValue}
                        onOpen={handleOpen}
                    />
                )}
            </MailSearchSpotlight>
            <SearchOverlay id={uid} isOpen={isOpen} anchorRef={anchorRef} onClose={close}>
                <AdvancedSearch
                    isNarrow={breakpoints.isNarrow}
                    showEncryptedSearch={showEncryptedSearch}
                    onClose={close}
                    esState={esState}
                    esInteraction={esInteraction}
                    handleESInteraction={handleESInteraction}
                    showMore={showMore}
                    toggleShowMore={toggleShowMore}
                    searchInputValue={searchInputValue}
                    labelID={labelID}
                />
            </SearchOverlay>
        </>
    );
};

export default MailSearch;
