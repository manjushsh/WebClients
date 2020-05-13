import React, { MutableRefObject, useRef, useEffect, useState, ChangeEvent } from 'react';
import { c } from 'ttag';
import { Button, classnames } from 'react-components';

import EditorToolbar from './EditorToolbar';
import { EmbeddedMap, MessageExtended } from '../../../models/message';
import EditorSquire from './EditorSquire';
import { SquireType } from '../../../helpers/squire/squireConfig';
import { locateBlockquote } from '../../../helpers/message/messageBlockquote';
import { insertImage, setTextDirectionWithoutFocus } from '../../../helpers/squire/squireActions';
import { isPlainText as testIsPlainText } from '../../../helpers/message/messages';
import { RIGHT_TO_LEFT } from 'proton-shared/lib/constants';
import { setTextAreaCursorStart } from '../../../helpers/dom';
import { getContent } from '../../../helpers/message/messageContent';
import { useHandler } from '../../../hooks/useHandler';
import { removeEmbeddedHTML } from '../../../helpers/embedded/embeddedParser';
import { Attachment } from '../../../models/attachment';
import { MessageChange } from '../Composer';

interface ExternalEditorActions {
    insertEmbedded: (embeddeds: EmbeddedMap) => void;
    removeEmbedded: (attachments: Attachment[]) => void;
}

export type EditorActionsRef = MutableRefObject<ExternalEditorActions | undefined>;

interface Props {
    message: MessageExtended;
    document?: Element;
    disabled: boolean;
    onReady: () => void;
    onChange: MessageChange;
    onChangeContent: (content: string) => void;
    onChangeFlag: (changes: Map<number, boolean>) => void;
    onFocus: () => void;
    onAddAttachments: (files: File[]) => void;
    onAddEmbeddedImages: (files: File[]) => void;
    onRemoveAttachment: (attachment: Attachment) => () => void;
    contentFocusRef: MutableRefObject<() => void>;
    editorActionsRef: EditorActionsRef;
}

const Editor = ({
    message,
    disabled,
    onReady,
    onChange,
    onChangeContent,
    onChangeFlag,
    onFocus,
    onAddAttachments,
    onAddEmbeddedImages,
    onRemoveAttachment,
    contentFocusRef,
    editorActionsRef
}: Props) => {
    const isPlainText = testIsPlainText(message.data);

    const [editorReady, setEditorReady] = useState(false);
    const [documentReady, setDocumentReady] = useState(false);
    const [blockquoteExpanded, setBlockquoteExpanded] = useState(true);
    const [blockquoteSaved, setBlockquoteSaved] = useState('');

    const squireRef = useRef<SquireType>(null) as MutableRefObject<SquireType>;
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (message.document?.innerHTML) {
            setDocumentReady(true);
        }
    }, [message.document?.innerHTML]);

    // Initialize Squire (or textarea) content at (and only) startup
    useEffect(() => {
        if (isPlainText) {
            setEditorReady(false);
        }

        if (documentReady) {
            if (isPlainText) {
                if (textareaRef.current) {
                    const content = getContent(message);
                    textareaRef.current.value = content;
                    setTextAreaCursorStart(textareaRef.current);

                    contentFocusRef.current = textareaRef.current?.focus.bind(squireRef.current);
                }
            } else {
                if (editorReady) {
                    const [content, blockquote] = locateBlockquote(message.document);
                    setBlockquoteSaved(blockquote);
                    setBlockquoteExpanded(blockquote === '');

                    squireRef.current?.setHTML(content);
                    setTextDirectionWithoutFocus(
                        squireRef.current,
                        message.data?.RightToLeft?.valueOf() || RIGHT_TO_LEFT.OFF
                    );

                    contentFocusRef.current = squireRef.current?.focus.bind(squireRef.current);
                }
            }
            onReady();
        }
    }, [editorReady, documentReady, isPlainText]);

    const handleReady = () => {
        setEditorReady(true);
    };

    const handleInput = (content: string) => {
        if (!blockquoteExpanded) {
            onChangeContent(content + blockquoteSaved);
        } else {
            onChangeContent(content);
        }
    };

    const handleShowBlockquote = () => {
        setBlockquoteExpanded(true);
        const content = squireRef.current.getHTML();
        squireRef.current.setHTML(content + blockquoteSaved);
    };

    const handleInsertEmbedded = useHandler(async (embeddeds: EmbeddedMap) => {
        embeddeds.forEach((info, cid) => {
            insertImage(squireRef.current, info.url || '', { 'data-embedded-img': cid, alt: info.attachment.Name });
        });
    });

    const handleRemoveEmbedded = useHandler(async (attachments: Attachment[]) => {
        const document = (squireRef.current.getDocument() as any) as Element;
        attachments.forEach((attachment) => {
            removeEmbeddedHTML(document, attachment);
        });
    });

    const handlePlainTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
        onChangeContent(event.target.value);
    };

    useEffect(() => {
        editorActionsRef.current = {
            insertEmbedded: handleInsertEmbedded,
            removeEmbedded: handleRemoveEmbedded
        };
    }, []);

    return (
        <div className={classnames(['editor w100 h100 rounded flex flex-column', disabled && 'editor--disabled'])}>
            <EditorToolbar
                message={message}
                squireRef={squireRef}
                editorReady={editorReady}
                onChange={onChange}
                onChangeFlag={onChangeFlag}
                onAddAttachments={onAddAttachments}
            />
            {isPlainText ? (
                <textarea
                    className="w100 h100 flex-item-fluid pt1 pb1 pl0-5 pr0-5"
                    ref={textareaRef}
                    onFocus={onFocus}
                    onChange={handlePlainTextChange}
                    placeholder={c('Placeholder').t`Write your message`}
                />
            ) : (
                <>
                    <EditorSquire
                        ref={squireRef}
                        message={message}
                        onFocus={onFocus}
                        onReady={handleReady}
                        onInput={handleInput}
                        onAddEmbeddedImages={onAddEmbeddedImages}
                        onRemoveAttachment={onRemoveAttachment}
                    />
                    {!blockquoteExpanded && (
                        <div className="m0-5">
                            <Button className="pm-button--small" onClick={handleShowBlockquote}>
                                ...
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default Editor;
