import { createContext, useContext, useCallback, useEffect, useState } from 'react';

import { EVENT_TYPES } from '@proton/shared/lib/drive/constants';
import isTruthy from '@proton/shared/lib/helpers/isTruthy';

import { useDriveEventManager, DriveEvents } from '../events';
import { isDecryptedLinkSame } from './link';
import { EncryptedLink, DecryptedLink, LinkShareUrl } from './interface';

export type LinksState = {
    [shareId: string]: {
        links: Links;
        tree: Tree;
        // Timestamp of the last "Empty Trash" action to properly compute
        // isLocked flag for newly added links. Links added later needs
        // to have isLocked based on the information if API will delete it
        // or not.
        latestTrashEmptiedAt?: number;
    };
};

type Links = {
    [linkId: string]: Link;
};

export type Link = {
    encrypted: EncryptedLink;
    decrypted?: DecryptedLink;
};

type Tree = {
    [parentLinkId: string]: string[];
};

/**
 * useLinksStateProvider provides a storage to cache links.
 */
export function useLinksStateProvider() {
    const events = useDriveEventManager();

    const [state, setState] = useState<LinksState>({});

    useEffect(() => {
        const callback = (shareId: string, events: DriveEvents) =>
            setState((state) => updateByEvents(state, shareId, events));
        const callbackId = events.registerEventHandler(callback);
        return () => {
            events.unregisterEventHandler(callbackId);
        };
    }, []);

    const setLinks = useCallback((shareId: string, links: Link[]) => {
        setState((state) => addOrUpdate(state, shareId, links));
    }, []);

    const lockLinks = useCallback((shareId: string, linkIds: string[]) => {
        setState((state) => setLock(state, shareId, linkIds, true));
    }, []);

    const unlockLinks = useCallback((shareId: string, linkIds: string[]) => {
        setState((state) => setLock(state, shareId, linkIds, false));
    }, []);

    const lockTrash = useCallback((shareId: string) => {
        setState((state) => setLock(state, shareId, 'trash', true));
    }, []);

    const setCachedThumbnail = useCallback((shareId: string, linkId: string, url: string) => {
        setState((state) => setCachedThumbnailUrl(state, shareId, linkId, url));
    }, []);

    const getLink = useCallback(
        (shareId: string, linkId: string): Link | undefined => {
            return state[shareId]?.links[linkId];
        },
        [state]
    );

    const getChildren = useCallback(
        (shareId: string, parentLinkId: string): Link[] => {
            const childrenLinkIds = state[shareId]?.tree[parentLinkId] || [];
            return childrenLinkIds.map((linkId) => state[shareId].links[linkId]).filter(isTruthy);
        },
        [state]
    );

    const getAllShareLinks = (shareId: string): Link[] => {
        return Object.values(state[shareId]?.links || []);
    };

    const getTrashed = useCallback(
        (shareId: string): Link[] => {
            return getAllShareLinks(shareId).filter((link) => !!link.encrypted.trashed);
        },
        [state]
    );

    const getSharedByLink = useCallback(
        (shareId: string): Link[] => {
            return getAllShareLinks(shareId).filter(({ encrypted }) => !encrypted.trashed && !!encrypted.shareUrl);
        },
        [state]
    );

    return {
        setLinks,
        lockLinks,
        unlockLinks,
        lockTrash,
        setCachedThumbnail,
        getLink,
        getChildren,
        getTrashed,
        getSharedByLink,
    };
}

export function updateByEvents(state: LinksState, shareId: string, { events }: DriveEvents): LinksState {
    if (!state[shareId]) {
        return state;
    }

    events.forEach((event) => {
        if (event.eventType === EVENT_TYPES.DELETE) {
            state = deleteLinks(state, shareId, [event.encryptedLink.linkId]);
        } else {
            state = addOrUpdate(state, shareId, [{ encrypted: event.encryptedLink }]);
        }
    });

    return state;
}

export function deleteLinks(state: LinksState, shareId: string, linkIds: string[]): LinksState {
    if (!state[shareId]) {
        return state;
    }

    let updated = false;
    linkIds.forEach((linkId) => {
        const original = state[shareId].links[linkId];
        if (!original) {
            return;
        }

        updated = true;

        // Delete the link itself from links and tree.
        delete state[shareId].links[linkId];
        const originalParentChildren = state[shareId].tree[original.encrypted.parentLinkId];
        if (originalParentChildren) {
            state[shareId].tree[original.encrypted.parentLinkId] = originalParentChildren.filter(
                (childLinkId) => childLinkId !== linkId
            );
        }

        // Delete the root and children of the deleting link.
        state[shareId].tree[linkId]?.forEach((childLinkId) => {
            delete state[shareId].links[childLinkId];
        });
        delete state[shareId].tree[linkId];
    });

    return updated ? { ...state } : state;
}

export function addOrUpdate(state: LinksState, shareId: string, links: Link[]): LinksState {
    if (!links.length) {
        return state;
    }

    if (!state[shareId]) {
        state[shareId] = {
            links: {},
            tree: {},
        };
    }

    links.forEach((link) => {
        const { linkId, parentLinkId } = link.encrypted;

        const original = state[shareId].links[linkId];
        if (original) {
            const originalParentId = original.encrypted.parentLinkId;
            if (originalParentId !== parentLinkId) {
                const originalParentChildren = state[shareId].tree[originalParentId];
                if (originalParentChildren) {
                    state[shareId].tree[originalParentId] = originalParentChildren.filter(
                        (childLinkId) => childLinkId !== linkId
                    );
                }
            }

            original.decrypted = getNewDecryptedLink(original, link);
            original.encrypted = link.encrypted;
        } else {
            state[shareId].links[linkId] = link;
        }

        // Lock newly loaded trashed link if the whole trash is locked.
        // For example, when trash is being emptied but at the same time
        // the next page is loaded.
        const lastTrashed = state[shareId].latestTrashEmptiedAt;
        const cachedLink = state[shareId].links[linkId].decrypted;
        if (cachedLink?.trashed && lastTrashed && cachedLink.trashed < lastTrashed) {
            cachedLink.isLocked = true;
        }

        // Only root link has no parent ID.
        if (parentLinkId) {
            const parent = state[shareId].tree[parentLinkId];
            if (parent) {
                if (link.encrypted.trashed) {
                    state[shareId].tree[parentLinkId] = parent.filter((childId) => childId !== linkId);
                } else {
                    if (!parent.includes(linkId)) {
                        parent.push(linkId);
                    }
                }
            } else {
                state[shareId].tree[parentLinkId] = [linkId];
            }
        }
    });

    return { ...state };
}

/**
 * getNewDecryptedLink returns new version of decrypted link. It tries to
 * preserve the locally cached data, such as thumbnail or isLocked flag.
 * If the `newLink` has decrypted version, it is used directly and enhanced
 * with `getDecryptedLinkComputedData`.
 * If the `original` link has decrypted version, the new decrypted link
 * is combination of `newLink` encrypted version, `original` decrypted
 * values (such as name or fileModifyTime), and locally computed data.
 * If the case the new decrypted link doesn't match with previous encrypted
 * data and needs re-decryption, `isStale` is set for later decryption.
 * Decryption is not done right away, because the link might not be needed;
 * any view which needs data needs to make sure to run code to re-decrypt
 * stale links. The link is not cleared to not cause blinks in the UI.
 */
function getNewDecryptedLink(original: Link, newLink: Link): DecryptedLink | undefined {
    if (newLink.decrypted) {
        return {
            ...newLink.decrypted,
            ...getDecryptedLinkComputedData(
                original.decrypted,
                newLink.decrypted.activeRevision?.id,
                newLink.decrypted.shareUrl
            ),
        };
    }
    if (original.decrypted) {
        return {
            ...newLink.encrypted,
            encryptedName: original.decrypted.encryptedName,
            name: original.decrypted.name,
            fileModifyTime: original.decrypted.fileModifyTime,
            ...getDecryptedLinkComputedData(
                original.decrypted,
                newLink.encrypted.activeRevision?.id,
                newLink.encrypted.shareUrl
            ),
            isStale: !isDecryptedLinkSame(original.encrypted, newLink.encrypted),
        };
    }
    return undefined;
}

/**
 * getDecryptedLinkComputedData returns locally computed data.
 * The list includes:
 *  - numAccesses from shareUrl,
 *  - isLocked,
 *  - and cachedThumbnailUrl.
 */
function getDecryptedLinkComputedData(link?: DecryptedLink, newRevisionId?: string, newShareUrl?: LinkShareUrl) {
    return !link
        ? {}
        : {
              shareUrl: newShareUrl
                  ? {
                        ...newShareUrl,
                        numAccesses: getNewNumAccesses(newShareUrl, link),
                    }
                  : undefined,
              isLocked: link.isLocked,
              cachedThumbnailUrl: link.activeRevision?.id === newRevisionId ? link.cachedThumbnailUrl : undefined,
          };
}

function getNewNumAccesses(newShareUrl: LinkShareUrl, oldLink?: DecryptedLink): number | undefined {
    // Prefer the one coming from the new share URL info if set.
    if (newShareUrl.numAccesses !== undefined) {
        return newShareUrl.numAccesses;
    }
    // If not set, but we have it cached from before, use that.
    // This information is not part of every response.
    if (oldLink?.shareUrl?.numAccesses !== undefined) {
        return oldLink.shareUrl.numAccesses;
    }
    // If there is no old share URL, but there is incoming one, that
    // means it is freshly created share URL. In other words, it was
    // not shared yet. We can safely set zero in such case so we don't
    // have to do extra request to get zero.
    if (oldLink && !oldLink.shareUrl) {
        return 0;
    }
    // In all other cases keep undefined. We just don't know.
    return undefined;
}

export function setLock(
    state: LinksState,
    shareId: string,
    linkIdsOrTrash: string[] | 'trash',
    isLocked: boolean
): LinksState {
    if (!state[shareId]) {
        return state;
    }

    if (Array.isArray(linkIdsOrTrash)) {
        linkIdsOrTrash.forEach((linkId) => {
            if (!state[shareId].links[linkId]?.decrypted) {
                return;
            }

            state[shareId].links[linkId].decrypted = {
                ...(state[shareId].links[linkId].decrypted as DecryptedLink),
                isLocked,
            };
        });
    } else {
        state[shareId].latestTrashEmptiedAt = Date.now() / 1000; // From ms to sec.
        Object.entries(state[shareId].links)
            .filter(([, link]) => link.decrypted && link.decrypted.trashed)
            .forEach(([linkId, link]) => {
                state[shareId].links[linkId].decrypted = {
                    ...(link.decrypted as DecryptedLink),
                    isLocked,
                };
            });
    }
    return { ...state };
}

export function setCachedThumbnailUrl(
    state: LinksState,
    shareId: string,
    linkId: string,
    cachedThumbnailUrl: string
): LinksState {
    if (!state[shareId]) {
        return state;
    }

    const link = state[shareId].links[linkId];
    if (!link?.decrypted) {
        return state;
    }

    link.decrypted = {
        ...link.decrypted,
        cachedThumbnailUrl,
    };
    return { ...state };
}

const LinksStateContext = createContext<ReturnType<typeof useLinksStateProvider> | null>(null);

export function LinksStateProvider({ children }: { children: React.ReactNode }) {
    const value = useLinksStateProvider();
    return <LinksStateContext.Provider value={value}>{children}</LinksStateContext.Provider>;
}

export default function useLinksState() {
    const state = useContext(LinksStateContext);
    if (!state) {
        throw new Error('Trying to use uninitialized LinksStateProvider');
    }
    return state;
}
