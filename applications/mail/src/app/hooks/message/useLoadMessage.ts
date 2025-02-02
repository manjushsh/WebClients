import { useCallback } from 'react';
import { useDispatch } from 'react-redux';

import { useApi } from '@proton/components';

import { MessageWithOptionalBody } from '../../logic/messages/messagesTypes';
import { load, reload } from '../../logic/messages/read/messagesReadActions';
import { useInitializeMessage } from './useInitializeMessage';

export const useLoadMessage = (inputMessage: MessageWithOptionalBody) => {
    const dispatch = useDispatch();
    const api = useApi();

    return useCallback(async () => {
        dispatch(load({ ID: inputMessage.ID, api }));
    }, [inputMessage]);
};

export const useReloadMessage = (localID: string) => {
    const dispatch = useDispatch();
    const initializeMessage = useInitializeMessage();

    return useCallback(async () => {
        dispatch(reload({ ID: localID }));
        await initializeMessage(localID);
    }, [localID]);
};
