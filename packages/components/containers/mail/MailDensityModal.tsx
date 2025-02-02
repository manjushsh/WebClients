import { c } from 'ttag';

import { updateDensity } from '@proton/shared/lib/api/settings';
import { DENSITY } from '@proton/shared/lib/constants';

import { Button, ModalProps, ModalTwo, ModalTwoContent, ModalTwoFooter, ModalTwoHeader } from '../../components';
import { useApi, useEventManager, useLoading, useNotifications, useUserSettings } from '../../hooks';
import DensityRadiosCards from '../layouts/DensityRadiosCards';

import './ModalSettingsLayoutCards.scss';

const MailDensityModal = (props: ModalProps) => {
    const api = useApi();
    const { call } = useEventManager();
    const [{ Density }] = useUserSettings();
    const [loading, withLoading] = useLoading();
    const { createNotification } = useNotifications();
    const title = c('Title').t`Mailbox density`;

    const { onClose } = props;

    const handleChangeDensity = async (density: DENSITY) => {
        await api(updateDensity(density));
        await call();
        createNotification({ text: c('Success').t`Preference saved` });
    };

    const handleSubmit = () => onClose?.();

    return (
        <ModalTwo {...props}>
            <ModalTwoHeader title={title} />
            <ModalTwoContent>
                <div className="flex flex-nowrap mb1 on-mobile-flex-column flex-column">
                    <span className="mb1" id="densityMode_desc">
                        {c('Label').t`Select how your list of messages looks like by default.`}
                    </span>
                    <DensityRadiosCards
                        density={Density}
                        describedByID="densityMode_desc"
                        onChange={(value) => withLoading(handleChangeDensity(value))}
                        loading={loading}
                        liClassName="w100"
                        className="layoutCards-two-per-row"
                    />
                </div>
            </ModalTwoContent>
            <ModalTwoFooter>
                <Button className="mlauto" color="norm" onClick={handleSubmit}>{c('Action').t`OK`}</Button>
            </ModalTwoFooter>
        </ModalTwo>
    );
};

export default MailDensityModal;
