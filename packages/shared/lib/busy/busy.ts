import { traceError } from '../helpers/sentry';
import { ProtonConfig } from '../interfaces';

let uid = 0;
let busies = [] as number[];

const unregister = (id: number) => {
    busies = busies.filter((busy) => busy !== id);
};

const register = () => {
    const id = uid++;

    busies.push(id);

    return () => {
        unregister(id);
    };
};

const getIsBusy = () => {
    return busies.length > 0;
};

export default {
    unregister,
    register,
    getIsBusy,
};

export const dialogRootClassName = 'modal-container';

export const dropdownRootClassName = 'dropdown';

const domIsBusy = () => {
    /*
     * These verifications perform some dom querying operations so in
     * order to not unnecessarily waste performance we return early
     * should any of the conditions fail before evaluationg all of them
     */
    if (document.querySelector(`.${dialogRootClassName}`) !== null) {
        return true;
    }

    if (document.querySelector(`.${dropdownRootClassName}`) !== null) {
        return true;
    }

    const { activeElement } = document;

    if (activeElement === null) {
        return false;
    }

    if (
        (activeElement.closest('form') ||
            activeElement.closest('iframe') ||
            activeElement.closest('[contenteditable]')) !== null
    ) {
        return true;
    }

    return false;
};

const EVERY_THIRTY_MINUTES = 30 * 60 * 1000;

const isDifferent = (a?: string, b?: string) => !!a && !!b && b !== a;

export const newVersionUpdater = (config: ProtonConfig) => {
    const { VERSION_PATH, COMMIT } = config;

    const getVersion = () => fetch(VERSION_PATH).then((response) => response.json());

    const isNewVersionAvailable = async () => {
        try {
            const { commit } = await getVersion();

            return isDifferent(commit, COMMIT);
        } catch (error: any) {
            traceError(error);
        }
    };

    const handleVisibilityChange = () => {
        const documentIsVisible = !document.hidden && document.visibilityState === 'visible';

        if (!documentIsVisible && !domIsBusy() && !getIsBusy()) {
            window.location.reload();
        }
    };

    const registerVisibilityChangeListener = () => {
        document.addEventListener('visibilitychange', handleVisibilityChange);
    };

    const checkForNewVersion = async () => {
        if (await isNewVersionAvailable()) {
            registerVisibilityChangeListener();
        }
    };

    window.setInterval(
        /*
         * If passed directly, produces eslint error:
         * Promise returned in function argument where a void return was expected (@typescript-eslint)
         */
        () => {
            checkForNewVersion();
        },
        EVERY_THIRTY_MINUTES
    );
};