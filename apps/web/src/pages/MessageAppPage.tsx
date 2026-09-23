import { useTranslation } from "react-i18next";
import { useCurrentTime } from "../utils/use-current-time";
import { Fragment } from "react";
import type { ReactNode } from "react";
import type {
  AnnouncementCreateAudienceType,
  AnnouncementPriority,
} from "../types/announcements";
import {
  formatMessagingConversationTime as formatConversationTime,
  formatMessagingDay as formatMessageDay,
  formatMessagingLongDateTime as formatAnnouncementDate,
  formatMessagingTime as formatMessageTime,
  formatMessagingTimestampLabel as notificationTimestampLabel,
  isSameMessagingCalendarDay as isSameCalendarDay,
} from "../utils/messaging-date-time";
import {
  DENSITY_OPTIONS,
  THEME_OPTIONS,
  WALLPAPER_OPTIONS,
  resolveMessagingTheme,
} from "../utils/messaging-preferences";
import type {
  MessagingDensity,
  MessagingTheme,
  MessagingWallpaper,
} from "../utils/messaging-preferences";
import type { ConversationMuteSetting } from "../types/messaging";
import {
  AttachmentGlyph,
  CompactAttachmentAudio,
  MessageAttachmentCard,
  MessageTextWithMentions as renderMessageTextWithMentions,
  LocationMessageCard,
  SharedMediaThumbnail,
  MessageNavigationIcon,
  MessageStatusGlyph,
} from "./MessageAppFoundation";
import {
  PRIVATE_GROUP_HISTORY_OPTIONS,
  SETTINGS_TABS,
  MEDIA_ATTACHMENT_TYPES,
  AUDIO_ATTACHMENT_TYPES,
  DOCUMENT_ATTACHMENT_TYPES,
  ACCEPTED_ATTACHMENT_TYPES,
  COMPOSER_EMOJI_SECTIONS,
  MAX_MESSAGE_ATTACHMENT_FILES,
  customizationToken,
  groupMessageReactions,
  initials,
  toLocalDateTimeInputValue,
  isAnnouncementEditable,
  isAnnouncementDeletable,
  announcementEnumLabel,
  announcementAttachmentShortLabel,
  isAnnouncementImageAttachment,
  isAnnouncementVideoAttachment,
  isAnnouncementPdfAttachment,
  isAnnouncementTextAttachment,
  canPreviewAnnouncementAttachment,
  messagesBelongToSameVisualGroup,
  formatFileSize,
  isImageAttachment,
  isVideoAttachment,
  isAudioAttachment,
  getMessagePayloadValue,
  getOfficialAnnouncementPayload,
  browserNotificationPermissionLabel,
  formatRecordingDuration,
  isPdfAttachment,
  isTextPreviewAttachment,
  canPreviewAttachment,
  attachmentTypeTranslationKey,
  emptySharedContent,
  groupSharedContentByMonth,
  sharedLinkDomain,
  sharedLinkDescription,
  roleLabel,
  officialScopeLabel,
  employeeOrgContextLabel,
  officialAuditLabel,
  requestReasonLabel,
  requestStatusLabel,
  contactActionLabel,
  messageDeliveryPresentation,
  handleLinearKeyboardNavigation,
} from "./message-app-foundation";
import type {
  SharedContentTab,
  AnnouncementPublishTiming,
} from "./message-app-foundation";

import { useMessageAppController } from "./useMessageAppController";

export function MessageAppPage() {
  const currentTime = useCurrentTime();
  const { t } = useTranslation("messaging");
  const {
    navigate,
    account,
    accessToken,
    mainWorkspacePath,
    announcementMode,
    starredMode,
    archivedMode,
    requestMode,
    notificationMode,
    settingsMode,
    ownProfileMode,
    newConversationMode,
    createGroupMode,
    listCreateMode,
    selectedListId,
    listMode,
    listEditMode,
    listWorkspaceMode,
    listManagementMode,
    loggingOut,
    realtimeStatus,
    presenceByAccountId,
    conversations,
    conversationHasMore,
    chatFolders,
    chatFoldersLoading,
    chatFoldersError,
    listCandidatesLoading,
    listNameDraft,
    setListNameDraft,
    listSelectedConversationIds,
    listCandidateSearch,
    setListCandidateSearch,
    listSaving,
    listDeleting,
    listDeleteConfirmOpen,
    setListDeleteConfirmOpen,
    listWorkspaceError,
    setListWorkspaceError,
    announcementItems,
    announcementLoading,
    announcementError,
    announcementComposerOpen,
    announcementComposerMode,
    announcementComposerStatus,
    announcementComposerValues,
    setAnnouncementComposerValues,
    announcementAudienceOptions,
    announcementAudienceLoading,
    announcementComposerExistingAttachments,
    announcementComposerRemovedAttachmentIds,
    setAnnouncementComposerRemovedAttachmentIds,
    announcementComposerPendingAttachments,
    announcementComposerSubmitting,
    announcementComposerError,
    announcementComposerNotice,
    setAnnouncementComposerNotice,
    announcementDetailOpen,
    announcementDetail,
    announcementDetailLoading,
    announcementDetailError,
    announcementDeleteConfirmationOpen,
    setAnnouncementDeleteConfirmationOpen,
    announcementDetailAction,
    announcementAttachmentActionId,
    conversationListView,
    setConversationListView,
    conversationCategory,
    setConversationCategory,
    detailsPanelOpen,
    navigationExpanded,
    setNavigationExpanded,
    attachmentMenuOpen,
    setAttachmentMenuOpen,
    attachmentMenuView,
    setAttachmentMenuView,
    conversationActionMenuOpen,
    setConversationActionMenuOpen,
    conversationActionMenuView,
    setConversationActionMenuView,
    conversationHistoryAction,
    conversationHistorySubmitting,
    conversationHistoryError,
    conversationHistoryToast,
    setConversationHistoryToast,
    destructiveConfirmation,
    destructiveConfirmationError,
    composerEmojiOpen,
    setComposerEmojiOpen,
    openMessageMenuId,
    messageActionMenuAnchor,
    openReactionMenuId,
    activeMobileMessageId,
    reactionMenuPosition,
    selectedConversationId,
    setSelectedConversationId,
    messages,
    pinnedMessageBrowserOpen,
    setPinnedMessageBrowserOpen,
    setActivePinnedMessageIndex,
    newMessageCount,
    showJumpToLatest,
    conversationSearch,
    setConversationSearch,
    setMentionSuggestionsDismissed,
    activeMentionSuggestionIndex,
    setActiveMentionSuggestionIndex,
    messageText,
    setMessageText,
    setComposerCaretIndex,
    replyingTo,
    editingMessage,
    messageActionId,
    reactionActionId,
    messageInformation,
    messageInformationLoadingId,
    messageInformationError,
    messageInformationVisibleReadCount,
    setMessageInformationVisibleReadCount,
    messageInformationVisibleDeliveredCount,
    setMessageInformationVisibleDeliveredCount,
    conversationPreferenceLoading,
    conversationLoading,
    messageLoading,
    olderMessagesLoading,
    sendingMessage,
    sendAttemptFailed,
    setSendAttemptFailed,
    selectedAttachments,
    selectedAttachmentKind,
    attachmentUpload,
    voiceRecordingState,
    voiceRecordingSeconds,
    locationDurationMinutes,
    setLocationDurationMinutes,
    locationActionLoading,
    activeLiveLocation,
    attachmentViewer,
    announcementAttachmentViewer,
    sharedContentOpen,
    sharedContentReturnView,
    sharedContentTab,
    sharedContent,
    sharedContentLoading,
    sharedContentError,
    storageUsageScope,
    storageUsage,
    storageUsageLoading,
    storageUsageError,
    storageUsageActionId,
    storageDeleteConfirmation,
    setStorageDeleteConfirmation,
    hasOlderMessages,
    pageError,
    messageError,
    setMessageError,
    messageNotice,
    forwardingMessage,
    forwardDestinationIds,
    forwardSearch,
    setForwardSearch,
    forwardDestinationError,
    forwardSubmitting,
    groupPanelTab,
    setGroupPanelTab,
    groupManagementWorkspaceOpen,
    groupMemberSearch,
    setGroupMemberSearch,
    groupMembersExpanded,
    setGroupMembersExpanded,
    officialGroupMembers,
    officialGroupMembersHasMore,
    officialGroupMembersLoading,
    officialGroupMembersLoadingMore,
    officialGroupMembersError,
    officialGroupMemberSearchResults,
    officialGroupMemberSearchHasMore,
    officialGroupMemberSearchLoading,
    officialGroupMemberSearchLoadingMore,
    officialGroupMemberSearchError,
    officialMentionHasMore,
    officialMentionLoading,
    officialMentionLoadingMore,
    officialMentionError,
    profileReturnToGroupInformation,
    profileSharedGroupsExpanded,
    setProfileSharedGroupsExpanded,
    groupKind,
    setGroupKind,
    officialGroupScopes,
    officialGroupCanReconcileAll,
    officialGroupScopeKey,
    setOfficialGroupScopeKey,
    officialGroupScopesLoading,
    officialGroupAudit,
    officialGroupAuditLoading,
    officialGroupReconciling,
    groupTitle,
    setGroupTitle,
    groupDescription,
    setGroupDescription,
    groupSearch,
    setGroupSearch,
    groupContacts,
    groupSelectedAccountIds,
    setGroupSelectedAccountIds,
    groupSelectedContacts,
    setGroupSelectedContacts,
    groupContactsLoading,
    groupSubmitting,
    groupActionAccountId,
    groupError,
    setGroupError,
    groupInviteLink,
    groupInviteLoading,
    groupInviteNotice,
    groupInviteError,
    inviteJoinLoading,
    groupPhotoUploading,
    groupPhotoInputRef,
    privateGroupDialogOpen,
    privateGroupSearch,
    setPrivateGroupSearch,
    privateGroupContacts,
    privateGroupSelectedAccountIds,
    privateGroupSelectedContacts,
    privateGroupHistoryWindow,
    setPrivateGroupHistoryWindow,
    privateGroupContactsLoading,
    privateGroupSubmitting,
    privateGroupError,
    contactSearch,
    setContactSearch,
    contacts,
    contactsLoading,
    contactError,
    creatingConversationId,
    starredLoading,
    starredLoadingMore,
    starredHasMore,
    starredError,
    messageRequests,
    requestListView,
    setRequestListView,
    setSelectedRequestId,
    requestsLoading,
    requestActionId,
    requestError,
    requestNotice,
    setRequestNotice,
    notifications,
    notificationUnreadCount,
    notificationListView,
    setNotificationListView,
    activeUtilityPanel,
    profileAccountId,
    notificationToast,
    notificationsLoading,
    notificationError,
    notificationActionNotice,
    notificationBulkAction,
    notificationDeletingId,
    notificationSoundEnabled,
    setNotificationSoundEnabled,
    browserNotificationsEnabled,
    backgroundPushReady,
    settingsTab,
    setSettingsTab,
    messagingSettingsLoading,
    messagingSettingsSaving,
    messagingSettingsError,
    messagingSettingsNotice,
    securityAction,
    securityNotice,
    securityError,
    messagingCustomization,
    messagingSettings,
    systemPrefersDark,
    blockedAccounts,
    blockedAccountsLoading,
    blockActionAccountId,
    blockSettingsError,
    blockSettingsNotice,
    searchPanelOpen,
    searchText,
    setSearchText,
    searchResults,
    searchLoading,
    searchError,
    highlightedMessageId,
    profileData,
    profilePhotoUrl,
    profilePhotoUrls,
    profileLoading,
    profileSaving,
    profileError,
    messageListRef,
    messageThreadContentRef,
    conversationActionButtonRef,
    conversationActionMenuRef,
    conversationHistoryDialogRef,
    conversationHistoryCancelRef,
    messageSearchInputRef,
    messageSearchTriggerRef,
    closeMessageSearchPanel,
    composerRef,
    conversationSearchInputRef,
    conversationListRef,
    attachmentInputRef,
    attachmentMenuRef,
    attachmentMenuButtonRef,
    attachmentViewerDialogRef,
    composerEmojiMenuRef,
    composerEmojiButtonRef,
    selectedConversation,
    loadOfficialGroupMemberPage,
    loadMoreOfficialGroupMembers,
    selectedChatFolder,
    conversationHistoryTarget,
    announcementComposerGroup,
    canManageSelectedAnnouncementGroup,
    destructiveConfirmationSubmitting,
    destructiveConfirmationContent,
    groupInviteUrl,
    activeMentionQuery,
    loadMoreOfficialMentionSuggestions,
    mentionSuggestions,
    mentionPanelVisible,
    activeMentionOptionId,
    canCreateOfficialGroup,
    selectedOfficialGroupScope,
    filteredConversations,
    conversationSearchResults,
    filteredListCandidateConversations,
    announcementGroupSearchResults,
    filteredStarredItems,
    filteredRequestItems,
    filteredNotifications,
    selectedMessageRequest,
    conversationSearchResultCount,
    displayMessages,
    visiblePinnedMessages,
    normalizedPinnedMessageIndex,
    activePinnedMessage,
    filteredForwardConversations,
    totalUnread,
    loadConversations,
    loadChatFolders,
    loadListCandidateConversations,
    loadSelectedGroupAnnouncements,
    openAnnouncementComposer,
    closeAnnouncementDetail,
    openAnnouncementEditor,
    handleAnnouncementAttachmentSelection,
    removePendingAnnouncementAttachment,
    handleAnnouncementComposerSubmit,
    handleAnnouncementComposerCancel,
    handleAnnouncementAcknowledgement,
    handleAnnouncementDelete,
    closeAnnouncementAttachmentViewer,
    handleAnnouncementAttachmentOpen,
    handleAnnouncementAttachmentDownload,
    loadStarredMessages,
    loadMoreStarredMessages,
    loadMessageRequests,
    stopLocalTyping,
    updateLocalTyping,
    clearSelectedAttachment,
    releaseInitialMessageBottomAnchor,
    handleMessageThreadScroll,
    jumpToLatestMessages,
    handleMessageMediaLayoutReady,
    handleLogout,
    openCreateGroup,
    openGroupInformation,
    openManageGroup,
    returnToConversationInformation,
    closeGroupDialog,
    openPrivateGroupDialog,
    closePrivateGroupDialog,
    togglePrivateGroupMember,
    toggleGroupMember,
    handleCreateGroup,
    handleCreatePrivateGroup,
    handleReconcileOfficialGroups,
    handleSaveGroupDetails,
    handleCreateGroupInviteLink,
    handleCopyGroupInviteLink,
    handleRevokeGroupInviteLink,
    handleGroupPhotoChange,
    handleRemoveGroupPhoto,
    handleAddGroupMembers,
    handleGroupRoleChange,
    handleRemoveGroupMember,
    openNewConversation,
    openCreateList,
    openChatFolder,
    openSelectedListManager,
    toggleListConversation,
    handleSaveMessageList,
    handleDeleteMessageList,
    openProfile,
    closeProfile,
    closeConversationDetailsPanel,
    handleStartProfileConversation,
    handleCreateConversation,
    openMessageRequests,
    openNotificationsWorkspace,
    openSettingsWorkspace,
    handleNotificationClick,
    handleMarkAllNotificationsRead,
    handleDeleteNotification,
    handleDeleteReadNotifications,
    updateMessagingCustomization,
    resetMessagingCustomization,
    updateMessagingSettings,
    resetPrivacySettings,
    resetNotificationSettings,
    handleBrowserNotificationToggle,
    handleLogoutAllDevices,
    openMessageSearchPanel,
    openSearchMessageResult,
    handleAcceptRequest,
    handleDeclineRequest,
    handleBlockRequest,
    handleUnblockAccount,
    beginVoiceRecording,
    finishVoiceRecording,
    cancelVoiceRecording,
    handleShareCurrentLocation,
    handleStartLiveLocation,
    handleStopLiveLocation,
    removeSelectedAttachment,
    openAttachmentPicker,
    insertComposerEmoji,
    handleAttachmentChange,
    handleDownloadAttachment,
    closeAttachmentViewer,
    handlePreviewAttachment,
    handleReaction,
    focusReplySource,
    closePinnedMessageBrowser,
    movePinnedMessageSelection,
    focusPinnedMessage,
    focusSharedContentMessage,
    openSharedContentPanel,
    selectSharedContentTab,
    returnFromSharedContent,
    closeSharedContentPanel,
    loadStorageUsage,
    openStorageUsage,
    handleStorageWorkspaceBack,
    openStorageOriginalMessage,
    handleStorageFileDelete,
    closeMessageInformationPanel,
    openConversationHistoryConfirmation,
    closeConversationHistoryConfirmation,
    openDestructiveConfirmation,
    closeDestructiveConfirmation,
    submitDestructiveConfirmation,
    handlePersonalConversationHistoryAction,
    toggleConversationFavorite,
    changeConversationMute,
    closeActiveConversation,
    beginReply,
    cancelMessageAction,
    closeForwardDialog,
    toggleForwardDestination,
    handleForwardMessage,
    handleMentionSelect,
    handleSendMessage,
    handleComposerKeyDown,
    handleLoadOlderMessages,
    realtimeLabel,
    peer,
    peerPresence,
    typingParticipants,
    peerActivityLabel,
    selectedGroupMemberIds,
    privateGroupOriginalMemberIds,
    blockedMessageRequests,
    blockedAccountIds,
    groupInfoConversation,
    groupInfoParticipants,
    groupInfoOwner,
    groupInfoAdmins,
    selectedConversationSharedContent,
    closeTransientMessagePopups,
    handleMessagePointerEnter,
    handleMobileMessagePointerDown,
    handleMobileMessagePointerMove,
    handleMobileMessagePointerEnd,
    handleMobileMessageContextMenu,
    toggleMessageActionMenu,
    toggleReactionMenu,
    handleNavigationClickCapture,
    localizedAttachmentLabel,
    renderIdentityAvatar,
    renderAccountAvatar,
    renderGroupAvatar,
    renderConversationAvatar,
    announcementAttachmentViewerItems,
    announcementAttachmentViewerIndex,
    announcementAttachmentViewerShowsFooter,
    attachmentViewerItems,
    attachmentViewerIndex,
    attachmentViewerShowsFooter,
    composerHasContent,
    showVoiceRecordAction,
    remainingMessageCharacters,
    composerSendState,
    messageActionMenuMessage,
    reactionMenuMessage,
    mobileMessageActionMessage,
    renderFloatingReactionMenu,
    renderFloatingMessageActionMenu,
    handleConversationSearchKeyDown,
    handleConversationListKeyDown,
    conversationPeerFor,
    renderConversationRow,
    renderConversationLoadMoreControl,
    renderStarredMessageRow,
    renderMessageRequestRow,
    renderAnnouncementGroupRow,
    renderAnnouncementCard,
    renderGroupSearchResult,
    renderProfileContent,
  } = useMessageAppController();

  function renderMessageInformationPanel(): ReactNode {
    const information = messageInformation;
    const recipients = information?.recipients ?? [];
    const readRecipients = recipients
      .filter((recipient) => Boolean(recipient.readAt))
      .sort(
        (first, second) =>
          new Date(second.readAt ?? 0).getTime() -
          new Date(first.readAt ?? 0).getTime(),
      );
    const deliveredRecipients = recipients
      .filter(
        (recipient) => !recipient.readAt && Boolean(recipient.deliveredAt),
      )
      .sort(
        (first, second) =>
          new Date(second.deliveredAt ?? 0).getTime() -
          new Date(first.deliveredAt ?? 0).getTime(),
      );
    const pendingCount = recipients.filter(
      (recipient) => !recipient.deliveredAt,
    ).length;
    const visibleReadRecipients = readRecipients.slice(
      0,
      messageInformationVisibleReadCount,
    );
    const visibleDeliveredRecipients = deliveredRecipients.slice(
      0,
      messageInformationVisibleDeliveredCount,
    );
    const directRecipient = recipients[0] ?? null;
    const directMessage =
      selectedConversation?.type === "PRIVATE" ||
      information?.summary.totalRecipients === 1;
    const previewLabel = information
      ? information.message.isDeleted
        ? t("messageInfo.deleted")
        : localizedAttachmentLabel(information.message)
      : "";
    const attachmentCount = information?.message.attachments.length ?? 0;

    const renderRecipientRow = (
      recipient: (typeof recipients)[number],
      timestamp: string | null,
    ) => (
      <article key={recipient.accountId} className="message-info-modern-person">
        {renderAccountAvatar(recipient.account, "message-avatar small")}
        <div className="message-info-modern-person-copy">
          <strong>{recipient.account.displayName}</strong>
          <small>
            {recipient.account.employee?.designation ??
              roleLabel(recipient.account.role, t)}
          </small>
        </div>
        {timestamp && (
          <time dateTime={timestamp}>
            {notificationTimestampLabel(timestamp)}
          </time>
        )}
      </article>
    );

    return (
      <div className="message-modern-detail-view message-modern-message-info-view">
        <header className="message-modern-detail-header">
          <span className="message-modern-detail-spacer" aria-hidden="true" />
          <button
            type="button"
            className="message-modern-detail-back message-modern-detail-mobile-back"
            onClick={closeMessageInformationPanel}
            aria-label={t("messageInfo.back")}
          >
            <span aria-hidden="true">←</span>
          </button>
          <div>
            <span>{t("messageInfo.eyebrow")}</span>
            <strong>{t("messageInfo.title")}</strong>
          </div>
          <button
            type="button"
            className="message-modern-detail-close"
            onClick={closeMessageInformationPanel}
            aria-label={t("messageInfo.close")}
          >
            <MessageNavigationIcon name="close" />
          </button>
        </header>

        <div className="message-modern-detail-scroll message-info-modern-scroll">
          {messageInformationLoadingId ? (
            <div className="message-list-state compact" role="status">
              <span className="message-small-spinner" aria-hidden="true" />
              <p>{t("messageInfo.loading")}</p>
            </div>
          ) : messageInformationError && !information ? (
            <div className="message-inline-error compact" role="alert">
              <p>{messageInformationError}</p>
            </div>
          ) : information ? (
            <>
              <section
                className={`message-info-modern-preview${
                  information.message.isDeleted ? " is-deleted" : ""
                }`}
                aria-label={t("messageInfo.previewAria")}
              >
                <div className="message-info-modern-bubble">
                  {information.message.forwardedFrom && (
                    <span className="message-info-modern-forwarded">
                      {t("thread.message.forwarded")}
                    </span>
                  )}
                  <p>{previewLabel}</p>
                  {attachmentCount > 0 && information.message.textContent && (
                    <small>
                      {t("messageInfo.attachments", { count: attachmentCount })}
                    </small>
                  )}
                  <footer>
                    <time dateTime={information.sentAt}>
                      {notificationTimestampLabel(information.sentAt)}
                    </time>
                    {information.editedAt && (
                      <span>{t("thread.message.edited")}</span>
                    )}
                  </footer>
                </div>
              </section>

              {directMessage ? (
                <section
                  className="message-info-modern-direct"
                  aria-label={t("messageInfo.deliveryStatus")}
                >
                  <div className="message-info-modern-direct-row delivered">
                    <span
                      className="message-info-modern-status-icon"
                      aria-hidden="true"
                    >
                      ✓✓
                    </span>
                    <div>
                      <strong>{t("messageInfo.delivered")}</strong>
                      <span>
                        {directRecipient?.deliveredAt
                          ? notificationTimestampLabel(
                              directRecipient.deliveredAt,
                            )
                          : t("messageInfo.pending")}
                      </span>
                    </div>
                  </div>
                  <div className="message-info-modern-direct-row read">
                    <span
                      className="message-info-modern-status-icon"
                      aria-hidden="true"
                    >
                      ✓✓
                    </span>
                    <div>
                      <strong>{t("messageInfo.read")}</strong>
                      <span>
                        {directRecipient?.readAt
                          ? notificationTimestampLabel(directRecipient.readAt)
                          : directRecipient?.readHidden
                            ? t("messageInfo.hiddenByPrivacy")
                            : t("messageInfo.notRead")}
                      </span>
                    </div>
                  </div>
                </section>
              ) : (
                <div className="message-info-modern-status-sections">
                  <section className="message-info-modern-section">
                    <header>
                      <span
                        className="message-info-modern-status-icon read"
                        aria-hidden="true"
                      >
                        ✓✓
                      </span>
                      <strong>{t("messageInfo.readBy")}</strong>
                      <small>{readRecipients.length}</small>
                    </header>

                    {visibleReadRecipients.length > 0 ? (
                      <div className="message-info-modern-people">
                        {visibleReadRecipients.map((recipient) =>
                          renderRecipientRow(recipient, recipient.readAt),
                        )}
                      </div>
                    ) : (
                      <p className="message-info-modern-empty">
                        {t("messageInfo.noReadReceipts")}
                      </p>
                    )}

                    {visibleReadRecipients.length < readRecipients.length && (
                      <button
                        type="button"
                        className="message-info-modern-more"
                        onClick={() =>
                          setMessageInformationVisibleReadCount(
                            (current) => current + 40,
                          )
                        }
                      >
                        {t("messageInfo.showMoreReadReceipts")}
                        <span>
                          {readRecipients.length - visibleReadRecipients.length}
                        </span>
                      </button>
                    )}
                  </section>

                  {deliveredRecipients.length > 0 && (
                    <section className="message-info-modern-section">
                      <header>
                        <span
                          className="message-info-modern-status-icon delivered"
                          aria-hidden="true"
                        >
                          ✓✓
                        </span>
                        <strong>{t("messageInfo.deliveredTo")}</strong>
                        <small>{deliveredRecipients.length}</small>
                      </header>

                      <div className="message-info-modern-people">
                        {visibleDeliveredRecipients.map((recipient) =>
                          renderRecipientRow(recipient, recipient.deliveredAt),
                        )}
                      </div>

                      {visibleDeliveredRecipients.length <
                        deliveredRecipients.length && (
                        <button
                          type="button"
                          className="message-info-modern-more"
                          onClick={() =>
                            setMessageInformationVisibleDeliveredCount(
                              (current) => current + 40,
                            )
                          }
                        >
                          {t("messageInfo.showMoreDeliveryReceipts")}
                          <span>
                            {deliveredRecipients.length -
                              visibleDeliveredRecipients.length}
                          </span>
                        </button>
                      )}
                    </section>
                  )}

                  {(pendingCount > 0 || information.summary.readHidden > 0) && (
                    <div className="message-info-modern-notes">
                      {pendingCount > 0 && (
                        <p>
                          {t("messageInfo.pendingDelivery", {
                            count: pendingCount,
                          })}
                        </p>
                      )}
                      {information.summary.readHidden > 0 && (
                        <p>{t("messageInfo.someReadHidden")}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    );
  }

  function renderSharedContentPanel(): ReactNode {
    const content = sharedContent ?? emptySharedContent();
    const hasAnyContent =
      content.media.length > 0 ||
      content.documents.length > 0 ||
      content.links.length > 0;
    const mediaGroups = groupSharedContentByMonth(content.media);
    const documentGroups = groupSharedContentByMonth(content.documents);
    const linkGroups = groupSharedContentByMonth(content.links);

    return (
      <div className="message-modern-detail-view message-shared-panel-view">
        <header className="message-modern-detail-header">
          <button
            type="button"
            className="message-modern-detail-back"
            onClick={returnFromSharedContent}
            aria-label={t("sharedContent.back")}
          >
            <span aria-hidden="true">←</span>
          </button>
          <div>
            <span>{t("sharedContent.eyebrow")}</span>
            <strong>{t("sharedContent.title")}</strong>
          </div>
          <button
            type="button"
            className="message-modern-detail-close"
            onClick={closeSharedContentPanel}
            aria-label={t("sharedContent.close")}
          >
            <MessageNavigationIcon name="close" />
          </button>
        </header>

        <nav
          className="message-shared-panel-tabs"
          role="tablist"
          aria-label={t("sharedContent.categoriesAria")}
        >
          {(
            [
              ["MEDIA", t("sharedContent.media"), content.media.length],
              [
                "DOCUMENTS",
                t("sharedContent.documents"),
                content.documents.length,
              ],
              ["LINKS", t("sharedContent.links"), content.links.length],
            ] as Array<[SharedContentTab, string, number]>
          ).map(([tab, label, count]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              className={sharedContentTab === tab ? "active" : undefined}
              aria-selected={sharedContentTab === tab}
              onClick={() => selectSharedContentTab(tab)}
            >
              <span>{label}</span>
              <b>{count}</b>
            </button>
          ))}
        </nav>

        <div className="message-modern-detail-scroll message-shared-panel-scroll">
          {sharedContentLoading && !hasAnyContent ? (
            <div className="message-shared-panel-state" role="status">
              <span className="message-small-spinner" aria-hidden="true" />
              <strong>{t("sharedContent.loading")}</strong>
              <p>{t("sharedContent.loadingDescription")}</p>
            </div>
          ) : sharedContentError && !hasAnyContent ? (
            <div className="message-shared-panel-state" role="alert">
              <MessageNavigationIcon name="shared" />
              <strong>{t("sharedContent.unavailable")}</strong>
              <p>{sharedContentError}</p>
              <button
                type="button"
                onClick={() =>
                  void openSharedContentPanel(
                    sharedContentTab,
                    sharedContentReturnView,
                  )
                }
              >
                {t("actions.retry")}
              </button>
            </div>
          ) : (
            <>
              {sharedContentLoading && (
                <div className="message-shared-refresh-state" role="status">
                  <span className="message-small-spinner" aria-hidden="true" />
                  <span>{t("sharedContent.refreshing")}</span>
                </div>
              )}

              {sharedContentTab === "MEDIA" ? (
                content.media.length === 0 ? (
                  <div className="message-shared-panel-state">
                    <AttachmentGlyph name="image" />
                    <strong>{t("sharedContent.noMedia")}</strong>
                    <p>{t("sharedContent.noMediaDescription")}</p>
                  </div>
                ) : (
                  <div className="message-shared-month-list">
                    {mediaGroups.map((group) => (
                      <section
                        key={group.key}
                        className="message-shared-month-group"
                      >
                        <h3>{group.label}</h3>
                        <div className="message-shared-media-grid">
                          {group.items.map((item) => (
                            <SharedMediaThumbnail
                              key={item.id}
                              accessToken={accessToken}
                              item={item}
                              onOpen={() =>
                                void handlePreviewAttachment(
                                  item.message,
                                  item.attachment,
                                )
                              }
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )
              ) : sharedContentTab === "DOCUMENTS" ? (
                content.documents.length === 0 ? (
                  <div className="message-shared-panel-state">
                    <AttachmentGlyph name="document" />
                    <strong>{t("sharedContent.noDocuments")}</strong>
                    <p>{t("sharedContent.noDocumentsDescription")}</p>
                  </div>
                ) : (
                  <div className="message-shared-month-list">
                    {documentGroups.map((group) => (
                      <section
                        key={group.key}
                        className="message-shared-month-group"
                      >
                        <h3>{group.label}</h3>
                        <div className="message-shared-document-list">
                          {group.items.map((item) => (
                            <article
                              key={item.id}
                              className="message-shared-document-item"
                            >
                              <button
                                type="button"
                                className="message-shared-document-main"
                                onClick={() => {
                                  if (canPreviewAttachment(item.attachment)) {
                                    void handlePreviewAttachment(
                                      item.message,
                                      item.attachment,
                                    );
                                  } else {
                                    focusSharedContentMessage(item.message);
                                  }
                                }}
                              >
                                <span className="message-shared-document-icon">
                                  <AttachmentGlyph
                                    name={
                                      isPdfAttachment(item.attachment)
                                        ? "pdf"
                                        : "document"
                                    }
                                  />
                                </span>
                                <span>
                                  <strong>
                                    {item.attachment.originalFileName}
                                  </strong>
                                  <small>
                                    {t(
                                      attachmentTypeTranslationKey(
                                        item.attachment,
                                      ),
                                    )}{" "}
                                    ·{" "}
                                    {formatFileSize(
                                      item.attachment.fileSizeBytes,
                                    )}
                                  </small>
                                  <small>
                                    {item.sender.displayName} ·{" "}
                                    {notificationTimestampLabel(item.sharedAt)}
                                  </small>
                                </span>
                              </button>
                              <button
                                type="button"
                                className="message-shared-download-action"
                                onClick={() =>
                                  void handleDownloadAttachment(
                                    item.message,
                                    item.attachment,
                                  )
                                }
                                aria-label={t("attachment.downloadNamed", {
                                  name: item.attachment.originalFileName,
                                })}
                                title={t("sharedContent.download")}
                              >
                                <AttachmentGlyph name="download" />
                              </button>
                            </article>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )
              ) : content.links.length === 0 ? (
                <div className="message-shared-panel-state">
                  <span
                    className="message-shared-link-state-icon"
                    aria-hidden="true"
                  >
                    ↗
                  </span>
                  <strong>{t("sharedContent.noLinks")}</strong>
                  <p>{t("sharedContent.noLinksDescription")}</p>
                </div>
              ) : (
                <div className="message-shared-month-list">
                  {linkGroups.map((group) => (
                    <section
                      key={group.key}
                      className="message-shared-month-group"
                    >
                      <h3>{group.label}</h3>
                      <div className="message-shared-link-list">
                        {group.items.map((item) => {
                          const description = sharedLinkDescription(item);

                          return (
                            <article
                              key={`${item.message.id}:${item.url}`}
                              className="message-shared-link-item"
                            >
                              <div className="message-shared-link-meta">
                                <strong>{item.sender.displayName}</strong>
                                <time>
                                  {notificationTimestampLabel(item.sharedAt)}
                                </time>
                              </div>
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="message-shared-link-preview"
                              >
                                <span className="message-shared-link-domain">
                                  {sharedLinkDomain(item.url, t)}
                                </span>
                                {description && <p>{description}</p>}
                                <span className="message-shared-link-url">
                                  {item.url}
                                </span>
                              </a>
                              <button
                                type="button"
                                className="message-shared-locate-action"
                                onClick={() =>
                                  focusSharedContentMessage(item.message)
                                }
                              >
                                {t("sharedContent.viewInChat")}
                              </button>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  function renderConversationProfilePanel(): ReactNode {
    const returnToGroupInformation =
      profileReturnToGroupInformation && selectedConversation?.type === "GROUP";
    const profilePresence = profileData
      ? presenceByAccountId[profileData.accountId]
      : null;
    const visibleSharedGroups = profileData
      ? profileSharedGroupsExpanded
        ? profileData.sharedGroups
        : profileData.sharedGroups.slice(0, 3)
      : [];
    const sharedContentSummary =
      sharedContent ?? selectedConversationSharedContent;
    const sharedContentCount =
      sharedContentSummary.media.length +
      sharedContentSummary.documents.length +
      sharedContentSummary.links.length;

    return (
      <div className="message-modern-detail-view">
        <header className="message-modern-detail-header">
          {returnToGroupInformation ? (
            <button
              type="button"
              className="message-modern-detail-back"
              onClick={closeProfile}
              aria-label={t("groupManagement.back")}
            >
              <span aria-hidden="true">←</span>
            </button>
          ) : (
            <>
              <span
                className="message-modern-detail-spacer"
                aria-hidden="true"
              />
              <button
                type="button"
                className="message-modern-detail-back message-modern-detail-mobile-back"
                onClick={closeConversationDetailsPanel}
                aria-label={t("profileDetail.backToConversation")}
              >
                <span aria-hidden="true">←</span>
              </button>
            </>
          )}
          <div>
            <span>
              {returnToGroupInformation
                ? t("profileDetail.groupInformation")
                : t("profileDetail.conversation")}
            </span>
            <strong>{t("profileDetail.title")}</strong>
          </div>
          <button
            type="button"
            className="message-modern-detail-close"
            onClick={closeConversationDetailsPanel}
            aria-label={t("profileDetail.close")}
          >
            <MessageNavigationIcon name="close" />
          </button>
        </header>

        <div className="message-modern-detail-scroll">
          {profileLoading && !profileData ? (
            <div className="message-list-state compact" role="status">
              <span className="message-small-spinner" aria-hidden="true" />
              <p>{t("profileDetail.loading")}</p>
            </div>
          ) : profileError && !profileData ? (
            <div className="message-inline-error compact" role="alert">
              <p>{profileError}</p>
            </div>
          ) : profileData ? (
            <>
              <section className="message-modern-profile-hero">
                <span className="message-profile-photo">
                  {profilePhotoUrl ? (
                    <img
                      src={profilePhotoUrl}
                      alt={t("profileDetail.profileImageAlt", {
                        name: profileData.displayName,
                      })}
                    />
                  ) : (
                    initials(profileData.displayName)
                  )}
                  {profileData.showOnlineStatus !== false &&
                    profilePresence?.isOnline && (
                      <span
                        className="message-modern-profile-presence"
                        aria-label={t("profileDetail.online")}
                      />
                    )}
                </span>
                <div>
                  <strong>{profileData.displayName}</strong>
                  <span>
                    {[
                      profileData.official?.designation ??
                        roleLabel(profileData.role, t),
                      profileData.official?.primaryOrgUnit?.name ??
                        profileData.official?.office?.name,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <small>
                    {profileData.showOnlineStatus !== false &&
                    profilePresence?.isOnline
                      ? t("profileDetail.online")
                      : t("profileDetail.nepalTelecom")}
                  </small>
                </div>
              </section>

              {profileError && (
                <div className="message-inline-error compact" role="alert">
                  <p>{profileError}</p>
                </div>
              )}

              {profileData.profileBio && (
                <section className="message-simple-detail-section">
                  <h3>{t("profileDetail.about")}</h3>
                  <p>{profileData.profileBio}</p>
                </section>
              )}

              <section className="message-simple-detail-section message-simple-action-list">
                <button
                  type="button"
                  className="message-simple-action-row"
                  onClick={() =>
                    void openSharedContentPanel(undefined, "PROFILE")
                  }
                >
                  <MessageNavigationIcon name="shared" />
                  <span>{t("profileDetail.sharedContent")}</span>
                  <b>{sharedContentCount}</b>
                  <span aria-hidden="true">›</span>
                </button>
              </section>

              <section className="message-simple-detail-section">
                <div className="message-modern-section-heading">
                  <h3>{t("profileDetail.contactInformation")}</h3>
                  <span>{t("profileDetail.verified")}</span>
                </div>
                <dl className="message-modern-info-list">
                  <div>
                    <dt>{t("profileDetail.employeeId")}</dt>
                    <dd>
                      {profileData.official?.employeeId ??
                        t("profileDetail.systemAccount")}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("profileDetail.officialEmail")}</dt>
                    <dd>
                      {profileData.official?.officialEmail ??
                        profileData.username ??
                        "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("profileDetail.contactNumber")}</dt>
                    <dd>{profileData.official?.contactNumber ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("profileDetail.designation")}</dt>
                    <dd>{profileData.official?.designation ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("profileDetail.office", { ns: "messaging" })}</dt>
                    <dd>{profileData.official?.office?.name ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("profileDetail.orgUnit", { ns: "messaging" })}</dt>
                    <dd>{profileData.official?.primaryOrgUnit?.name ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("profileDetail.orgPath")}</dt>
                    <dd>
                      {profileData.official?.orgUnitBreadcrumb
                        .map((unit) => unit.name)
                        .join(" › ") || "—"}
                    </dd>
                  </div>
                </dl>
              </section>

              {!profileData.isOwnProfile &&
                profileData.sharedGroups.length > 0 && (
                  <section className="message-simple-detail-section">
                    <div className="message-modern-section-heading">
                      <h3>{t("profileDetail.sharedGroups")}</h3>
                      <span>{profileData.sharedGroups.length}</span>
                    </div>
                    <div className="message-modern-shared-groups">
                      {visibleSharedGroups.map((group) => (
                        <div key={group.id}>
                          <strong>
                            {group.title ?? t("profileDetail.groupFallback")}
                          </strong>
                          <span>
                            {group.groupKind === "OFFICIAL"
                              ? t("profileDetail.official")
                              : t("profileDetail.personal")}{" "}
                            ·{" "}
                            {t("profileDetail.membersCount", {
                              count: group.memberCount,
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                    {profileData.sharedGroups.length > 3 && (
                      <button
                        type="button"
                        className="message-simple-expand-button"
                        onClick={() =>
                          setProfileSharedGroupsExpanded((current) => !current)
                        }
                      >
                        {profileSharedGroupsExpanded
                          ? t("profileDetail.showFewerGroups")
                          : t("profileDetail.viewAllSharedGroups", {
                              count: profileData.sharedGroups.length,
                            })}
                      </button>
                    )}
                  </section>
                )}

              <div className="message-modern-profile-actions">
                {profileData.isOwnProfile ? (
                  <button
                    type="button"
                    onClick={() => {
                      closeConversationDetailsPanel();
                      navigate("/messages/profile");
                    }}
                  >
                    {t("profileDetail.openMyProfile")}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleStartProfileConversation()}
                      disabled={
                        profileSaving ||
                        profileData.contactMode === "REQUEST_SENT" ||
                        profileData.contactMode === "BLOCKED"
                      }
                    >
                      {profileData.contactMode === "REQUEST_SENT"
                        ? t("profileDetail.requestSent")
                        : profileData.contactMode === "BLOCKED"
                          ? t("profileDetail.blocked")
                          : profileData.contactMode === "REQUEST_REQUIRED"
                            ? t("profileDetail.sendRequest")
                            : t("profileDetail.message")}
                    </button>

                    {profileData.blockDirection === "BLOCKED_BY_ME" ||
                    profileData.blockDirection === "MUTUAL" ||
                    blockedAccountIds.has(profileData.accountId) ? (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          void handleUnblockAccount(profileData.accountId)
                        }
                        disabled={blockActionAccountId !== null}
                      >
                        {blockActionAccountId === profileData.accountId
                          ? t("profileDetail.working")
                          : t("profileDetail.unblock")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="danger"
                        onClick={() =>
                          openDestructiveConfirmation({
                            kind: "BLOCK_PRIVATE_CONTACT",
                            target: profileData,
                          })
                        }
                        disabled={blockActionAccountId !== null}
                      >
                        {blockActionAccountId === profileData.accountId
                          ? t("profileDetail.working")
                          : t("profileDetail.block")}
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  function renderGroupInformationPanel(): ReactNode {
    if (!groupInfoConversation) {
      return null;
    }

    const query = groupMemberSearch.trim().toLocaleLowerCase();
    const officialGroup = groupInfoConversation.groupKind === "OFFICIAL";
    const roleRank: Record<string, number> = {
      OWNER: 0,
      ADMIN: 1,
      MEMBER: 2,
    };
    const participantSource = officialGroup
      ? query
        ? officialGroupMemberSearchResults
        : officialGroupMembers
      : groupInfoConversation.participants;
    const sortedParticipants = [...participantSource].sort(
      (first, second) =>
        (roleRank[first.participantRole] ?? 3) -
          (roleRank[second.participantRole] ?? 3) ||
        first.displayName.localeCompare(second.displayName, undefined, {
          sensitivity: "base",
        }) ||
        first.accountId.localeCompare(second.accountId),
    );
    const matchingParticipants =
      officialGroup || !query
        ? sortedParticipants
        : sortedParticipants.filter((participant) =>
            [
              participant.displayName,
              participant.username,
              participant.employee?.empId,
              participant.employee?.designation,
              employeeOrgContextLabel(participant.employee, null),
            ]
              .filter((value): value is string => Boolean(value))
              .some((value) => value.toLocaleLowerCase().includes(query)),
          );
    const visibleParticipants =
      query || groupMembersExpanded
        ? matchingParticipants
        : matchingParticipants.slice(0, 5);
    const officialMemberListLoading = officialGroup
      ? query
        ? officialGroupMemberSearchLoading
        : officialGroupMembersLoading
      : false;
    const officialMemberListLoadingMore = officialGroup
      ? query
        ? officialGroupMemberSearchLoadingMore
        : officialGroupMembersLoadingMore
      : false;
    const officialMemberListHasMore = officialGroup
      ? query
        ? officialGroupMemberSearchHasMore
        : officialGroupMembersHasMore
      : false;
    const officialMemberListError = officialGroup
      ? query
        ? officialGroupMemberSearchError
        : officialGroupMembersError
      : null;
    const sharedContentSummary =
      sharedContent ?? selectedConversationSharedContent;
    const sharedContentCount =
      sharedContentSummary.media.length +
      sharedContentSummary.documents.length +
      sharedContentSummary.links.length;

    return (
      <div className="message-modern-detail-view message-modern-group-view">
        <header className="message-modern-detail-header">
          <span className="message-modern-detail-spacer" aria-hidden="true" />
          <button
            type="button"
            className="message-modern-detail-back message-modern-detail-mobile-back"
            onClick={closeConversationDetailsPanel}
            aria-label={t("profileDetail.backToConversation")}
          >
            <span aria-hidden="true">←</span>
          </button>
          <div>
            <span>{t("groupInfo.conversation")}</span>
            <strong>{t("groupInfo.title")}</strong>
          </div>
          <button
            type="button"
            className="message-modern-detail-close"
            onClick={closeConversationDetailsPanel}
            aria-label={t("groupInfo.close")}
          >
            <MessageNavigationIcon name="close" />
          </button>
        </header>

        <div className="message-modern-detail-scroll">
          <section className="message-modern-group-hero">
            {renderGroupAvatar(
              groupInfoConversation,
              "message-group-photo-preview",
            )}
            <div>
              <strong>
                {groupInfoConversation.title ??
                  t("profileDetail.groupFallback")}
              </strong>
              <span>
                {groupInfoConversation.groupKind === "OFFICIAL"
                  ? t("groupInfo.officialGroup")
                  : t("groupInfo.personalGroup")}{" "}
                ·{" "}
                {t("profileDetail.membersCount", {
                  count: groupInfoConversation.memberCount,
                })}
              </span>
              {groupInfoConversation.description && (
                <p>{groupInfoConversation.description}</p>
              )}
            </div>
          </section>

          <section className="message-simple-detail-section message-simple-action-list">
            <button
              type="button"
              className="message-simple-action-row"
              onClick={() =>
                void openSharedContentPanel(undefined, "GROUP_INFORMATION")
              }
            >
              <MessageNavigationIcon name="shared" />
              <span>{t("profileDetail.sharedContent")}</span>
              <b>{sharedContentCount}</b>
              <span aria-hidden="true">›</span>
            </button>
          </section>

          <section className="message-simple-detail-section message-simple-members-section">
            <div className="message-modern-section-heading">
              <h3>{t("groupInfo.members")}</h3>
              <span>{groupInfoConversation.memberCount}</span>
            </div>

            <label className="message-modern-search-field">
              <MessageNavigationIcon name="search" />
              <input
                type="search"
                value={groupMemberSearch}
                onChange={(event) => setGroupMemberSearch(event.target.value)}
                placeholder={t("groupInfo.searchMembers")}
                aria-label={t("groupInfo.searchMembers")}
              />
            </label>

            {officialMemberListLoading && matchingParticipants.length === 0 ? (
              <p className="message-simple-empty-state">
                {t("groupInfo.loadingMembers")}
              </p>
            ) : officialMemberListError && matchingParticipants.length === 0 ? (
              <div className="message-simple-empty-state">
                <p>{officialMemberListError}</p>
                <button
                  type="button"
                  className="message-simple-expand-button"
                  onClick={() =>
                    void loadOfficialGroupMemberPage({
                      search: query,
                      cursor: null,
                      append: false,
                    })
                  }
                >
                  {t("groupInfo.retry")}
                </button>
              </div>
            ) : matchingParticipants.length === 0 ? (
              <p className="message-simple-empty-state">
                {t("groupInfo.noMembersMatch", {
                  query: groupMemberSearch.trim(),
                })}
              </p>
            ) : (
              <div className="message-simple-member-list">
                {visibleParticipants.map((participant) => {
                  const isViewer = participant.accountId === account?.id;

                  return (
                    <button
                      type="button"
                      key={participant.accountId}
                      className="message-simple-member-row"
                      onClick={() => openProfile(participant.accountId, true)}
                    >
                      {renderAccountAvatar(participant, "message-avatar small")}
                      <span className="message-simple-member-copy">
                        <strong>
                          {participant.displayName}
                          {isViewer ? ` ${t("groupInfo.youSuffix")}` : ""}
                        </strong>
                        <small>
                          {participant.employee?.designation ??
                            roleLabel(participant.role, t)}
                        </small>
                      </span>
                      <b className="message-simple-member-role">
                        {roleLabel(participant.participantRole, t)}
                      </b>
                    </button>
                  );
                })}
              </div>
            )}

            {!officialGroup && !query && matchingParticipants.length > 5 && (
              <button
                type="button"
                className="message-simple-expand-button"
                onClick={() => setGroupMembersExpanded((current) => !current)}
              >
                {groupMembersExpanded
                  ? t("groupInfo.showFewerMembers")
                  : t("groupInfo.viewAllMembers", {
                      count: matchingParticipants.length,
                    })}
              </button>
            )}

            {officialGroup &&
              !query &&
              !groupMembersExpanded &&
              groupInfoConversation.memberCount > 5 && (
                <button
                  type="button"
                  className="message-simple-expand-button"
                  onClick={() => setGroupMembersExpanded(true)}
                >
                  {t("groupInfo.viewAllMembers", {
                    count: groupInfoConversation.memberCount,
                  })}
                </button>
              )}

            {officialGroup &&
              (query || groupMembersExpanded) &&
              officialMemberListHasMore && (
                <button
                  type="button"
                  className="message-simple-expand-button"
                  onClick={loadMoreOfficialGroupMembers}
                  disabled={officialMemberListLoadingMore}
                  aria-busy={officialMemberListLoadingMore}
                >
                  {officialMemberListLoadingMore
                    ? t("groupInfo.loadingMoreMembers")
                    : t("groupInfo.loadMoreMembers")}
                </button>
              )}

            {officialGroup &&
              officialMemberListError &&
              matchingParticipants.length > 0 && (
                <p className="message-simple-empty-state">
                  {officialMemberListError}
                </p>
              )}
          </section>

          {groupInfoConversation.groupKind === "PERSONAL" ? (
            <section className="message-simple-detail-section message-simple-group-actions">
              {groupInfoConversation.canManageGroup && (
                <button
                  type="button"
                  className="message-simple-navigation-action"
                  onClick={openManageGroup}
                >
                  <MessageNavigationIcon name="profile" />
                  <span>{t("groupInfo.manageGroup")}</span>
                  <span aria-hidden="true">›</span>
                </button>
              )}
              {groupInfoConversation.viewerParticipantRole === "OWNER" && (
                <button
                  type="button"
                  className="message-simple-navigation-action danger"
                  onClick={() =>
                    openDestructiveConfirmation({
                      kind: "DELETE_GROUP",
                      conversationId: groupInfoConversation.id,
                      conversationTitle:
                        groupInfoConversation.title ?? t("groupInfo.thisGroup"),
                      groupKind: "PERSONAL",
                    })
                  }
                  disabled={groupSubmitting}
                >
                  <MessageNavigationIcon name="trash" />
                  <span>{t("groupInfo.deleteGroup")}</span>
                </button>
              )}
              <button
                type="button"
                className="message-simple-navigation-action danger"
                onClick={() =>
                  openDestructiveConfirmation({
                    kind: "LEAVE_GROUP",
                    conversationId: groupInfoConversation.id,
                    conversationTitle:
                      groupInfoConversation.title ?? t("groupInfo.thisGroup"),
                  })
                }
                disabled={groupSubmitting}
              >
                <MessageNavigationIcon name="close" />
                <span>
                  {groupSubmitting
                    ? t("groupInfo.leaving")
                    : t("groupInfo.leaveGroup")}
                </span>
              </button>
            </section>
          ) : (
            <>
              <p className="message-simple-group-note">
                {t("privateGroup.officialMembershipSync")}
              </p>
              {officialGroupCanReconcileAll &&
                groupInfoConversation.viewerParticipantRole === "OWNER" && (
                  <section className="message-simple-detail-section message-simple-group-actions">
                    <button
                      type="button"
                      className="message-simple-navigation-action danger"
                      onClick={() =>
                        openDestructiveConfirmation({
                          kind: "DELETE_GROUP",
                          conversationId: groupInfoConversation.id,
                          conversationTitle:
                            groupInfoConversation.title ??
                            t("groupInfo.thisGroup"),
                          groupKind: "OFFICIAL",
                        })
                      }
                      disabled={groupSubmitting}
                    >
                      <MessageNavigationIcon name="trash" />
                      <span>{t("groupInfo.deleteOfficialGroup")}</span>
                    </button>
                  </section>
                )}
            </>
          )}
        </div>
      </div>
    );
  }

  function renderGroupManagementWorkspaceContent(): ReactNode {
    if (!groupInfoConversation) {
      return null;
    }

    const canOpenSettings = groupInfoConversation.canManageGroup;

    return (
      <div className="message-group-management-workspace">
        <header className="message-group-management-header">
          <button
            type="button"
            className="message-modern-detail-back"
            onClick={returnToConversationInformation}
            disabled={groupSubmitting || groupActionAccountId !== null}
            aria-label={t("groupManagement.back")}
          >
            <span aria-hidden="true">←</span>
          </button>
          <div>
            <span>{t("groupManagement.eyebrow")}</span>
            <strong>{t("groupManagement.title")}</strong>
          </div>
          <button
            type="button"
            className="message-modern-detail-close"
            onClick={closeGroupDialog}
            disabled={groupSubmitting || groupActionAccountId !== null}
            aria-label={t("groupManagement.close")}
          >
            <MessageNavigationIcon name="close" />
          </button>
        </header>

        <div className="message-modern-detail-scroll">
          {groupError && (
            <div className="message-inline-error compact" role="alert">
              <p>{groupError}</p>
            </div>
          )}

          <section className="message-modern-group-hero">
            {renderGroupAvatar(
              groupInfoConversation,
              "message-group-photo-preview",
            )}
            <div>
              <strong>
                {groupInfoConversation.title ??
                  t("profileDetail.groupFallback")}
              </strong>
              <span>
                {groupInfoConversation.groupKind === "OFFICIAL"
                  ? officialScopeLabel(groupInfoConversation, t)
                  : `${t("profileDetail.membersCount", { count: groupInfoConversation.memberCount })}`}
              </span>
              {groupInfoConversation.description && (
                <p>{groupInfoConversation.description}</p>
              )}
              <div className="message-modern-group-badges">
                <span>
                  {groupInfoConversation.groupKind === "OFFICIAL"
                    ? t("groupManagement.officialGroup")
                    : t("groupManagement.personalGroup")}
                </span>
                <span>
                  {t("profileDetail.membersCount", {
                    count: groupInfoConversation.memberCount,
                  })}
                </span>
              </div>
            </div>
          </section>

          <nav
            className="message-modern-detail-tabs"
            aria-label={t("groupManagement.sectionsAria")}
          >
            <button
              type="button"
              className={groupPanelTab === "OVERVIEW" ? "active" : ""}
              onClick={() => setGroupPanelTab("OVERVIEW")}
            >
              {t("groupManagement.overviewTab")}
            </button>
            <button
              type="button"
              className={groupPanelTab === "MEMBERS" ? "active" : ""}
              onClick={() => setGroupPanelTab("MEMBERS")}
            >
              {t("groupManagement.membersTab")}
            </button>
            {canOpenSettings && (
              <button
                type="button"
                className={groupPanelTab === "SETTINGS" ? "active" : ""}
                onClick={() => setGroupPanelTab("SETTINGS")}
              >
                {t("groupManagement.settingsTab")}
              </button>
            )}
          </nav>

          {groupPanelTab === "OVERVIEW" && (
            <div className="message-modern-group-tab">
              <section className="message-modern-detail-section">
                <div className="message-modern-section-heading">
                  <h3>{t("groupManagement.sharedContent")}</h3>
                  <span>
                    {selectedConversationSharedContent.media.length +
                      selectedConversationSharedContent.documents.length +
                      selectedConversationSharedContent.links.length}
                  </span>
                </div>
                <div className="message-modern-shared-actions">
                  <button
                    type="button"
                    onClick={() =>
                      void openSharedContentPanel("MEDIA", "GROUP_MANAGEMENT")
                    }
                  >
                    <MessageNavigationIcon name="shared" />
                    <span>{t("groupManagement.media")}</span>
                    <b>{selectedConversationSharedContent.media.length}</b>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void openSharedContentPanel(
                        "DOCUMENTS",
                        "GROUP_MANAGEMENT",
                      )
                    }
                  >
                    <MessageNavigationIcon name="shared" />
                    <span>{t("groupManagement.documents")}</span>
                    <b>{selectedConversationSharedContent.documents.length}</b>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void openSharedContentPanel("LINKS", "GROUP_MANAGEMENT")
                    }
                  >
                    <MessageNavigationIcon name="shared" />
                    <span>{t("groupManagement.links")}</span>
                    <b>{selectedConversationSharedContent.links.length}</b>
                  </button>
                </div>
              </section>

              <section className="message-modern-detail-section">
                <div className="message-modern-section-heading">
                  <h3>{t("groupManagement.leadership")}</h3>
                  <span>
                    {groupInfoAdmins.length + (groupInfoOwner ? 1 : 0)}
                  </span>
                </div>
                <div className="message-modern-leadership-list">
                  {groupInfoOwner && (
                    <button
                      type="button"
                      onClick={() =>
                        openProfile(groupInfoOwner.accountId, true)
                      }
                    >
                      {renderAccountAvatar(
                        groupInfoOwner,
                        "message-avatar small",
                      )}
                      <span>
                        <strong>{groupInfoOwner.displayName}</strong>
                        <small>{t("groupManagement.owner")}</small>
                      </span>
                    </button>
                  )}
                  {groupInfoAdmins.map((admin) => (
                    <button
                      key={admin.accountId}
                      type="button"
                      onClick={() => openProfile(admin.accountId, true)}
                    >
                      {renderAccountAvatar(admin, "message-avatar small")}
                      <span>
                        <strong>{admin.displayName}</strong>
                        <small>{t("groupManagement.admin")}</small>
                      </span>
                    </button>
                  ))}
                  {!groupInfoOwner && groupInfoAdmins.length === 0 && (
                    <p>{t("groupManagement.noLeadership")}</p>
                  )}
                </div>
              </section>

              <p className="message-modern-security-note">
                {groupInfoConversation.groupKind === "OFFICIAL"
                  ? t("groupManagement.membershipNote1")
                  : t("groupManagement.membershipNote2")}
              </p>
            </div>
          )}

          {groupPanelTab === "MEMBERS" && (
            <div className="message-modern-group-tab">
              <section className="message-modern-detail-section message-modern-members-section">
                <div className="message-modern-section-heading">
                  <h3>{t("groupInfo.members")}</h3>
                  <span>{groupInfoConversation.memberCount}</span>
                </div>

                {groupInfoConversation.groupKind === "OFFICIAL" && (
                  <p className="message-modern-security-note compact">
                    {t("groupManagement.officialMembershipReadOnly")}
                  </p>
                )}

                <div className="message-modern-member-list">
                  {groupInfoParticipants.map((participant) => {
                    const isViewer = participant.accountId === account?.id;
                    const viewerRole =
                      groupInfoConversation.viewerParticipantRole;
                    const canChangeRole =
                      groupInfoConversation.groupKind === "PERSONAL" &&
                      viewerRole === "OWNER" &&
                      participant.participantRole !== "OWNER" &&
                      !participant.isOfficeHead &&
                      !isViewer;
                    const canRemove =
                      groupInfoConversation.groupKind === "PERSONAL" &&
                      groupInfoConversation.canManageGroup &&
                      participant.participantRole !== "OWNER" &&
                      !isViewer &&
                      (viewerRole === "OWNER" ||
                        participant.participantRole === "MEMBER");

                    return (
                      <article
                        key={participant.accountId}
                        className="message-modern-member-row"
                      >
                        <button
                          type="button"
                          className="message-modern-member-main"
                          onClick={() =>
                            openProfile(participant.accountId, true)
                          }
                        >
                          {renderAccountAvatar(
                            participant,
                            "message-avatar small",
                          )}
                          <span>
                            <strong>
                              {participant.displayName}
                              {isViewer ? ` ${t("groupInfo.youSuffix")}` : ""}
                            </strong>
                            <small>
                              {participant.employee?.designation ??
                                roleLabel(participant.role, t)}
                            </small>
                          </span>
                          <b>{roleLabel(participant.participantRole, t)}</b>
                        </button>

                        {(canChangeRole || canRemove) && (
                          <div className="message-modern-member-actions">
                            {canChangeRole && (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleGroupRoleChange(
                                    participant.accountId,
                                    participant.participantRole === "ADMIN"
                                      ? "MEMBER"
                                      : "ADMIN",
                                  )
                                }
                                disabled={groupActionAccountId !== null}
                              >
                                {groupActionAccountId === participant.accountId
                                  ? t("groupManagement.working")
                                  : participant.participantRole === "ADMIN"
                                    ? t("groupManagement.removeAdmin")
                                    : t("groupManagement.makeAdmin")}
                              </button>
                            )}
                            {canRemove && (
                              <button
                                type="button"
                                className="danger"
                                onClick={() =>
                                  void handleRemoveGroupMember(
                                    participant.accountId,
                                  )
                                }
                                disabled={groupActionAccountId !== null}
                              >
                                {t("groupManagement.remove")}
                              </button>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>

              {groupInfoConversation.groupKind === "PERSONAL" &&
                groupInfoConversation.canManageGroup && (
                  <section className="message-modern-detail-section">
                    <div className="message-modern-section-heading">
                      <h3>{t("groupManagement.addMembers")}</h3>
                      <span>
                        {t("summary.selected", {
                          total: groupSelectedAccountIds.length,
                        })}
                      </span>
                    </div>
                    <label className="message-modern-search-field">
                      <MessageNavigationIcon name="search" />
                      <input
                        type="search"
                        value={groupSearch}
                        onChange={(event) => setGroupSearch(event.target.value)}
                        placeholder={t("privateGroup.searchEmployees")}
                      />
                    </label>
                    <div className="message-modern-add-member-list">
                      {groupContactsLoading ? (
                        <div className="message-list-state compact">
                          <span className="message-small-spinner" />
                          <p>{t("groupManagement.searchingAccounts")}</p>
                        </div>
                      ) : groupContacts.length === 0 ? (
                        <div className="message-list-state compact">
                          <p>{t("groupManagement.noMatchingAccounts")}</p>
                        </div>
                      ) : (
                        groupContacts.map((contact) => {
                          const alreadyMember = selectedGroupMemberIds.has(
                            contact.accountId,
                          );
                          const selected = groupSelectedAccountIds.includes(
                            contact.accountId,
                          );
                          const eligible = contact.contactMode === "DIRECT";

                          return (
                            <label
                              key={contact.accountId}
                              className={`message-modern-add-member-row${
                                selected ? " selected" : ""
                              }${
                                !eligible || alreadyMember ? " disabled" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() =>
                                  toggleGroupMember(contact.accountId)
                                }
                                disabled={
                                  !eligible || alreadyMember || groupSubmitting
                                }
                              />
                              {renderAccountAvatar(
                                contact,
                                "message-avatar small",
                              )}
                              <span>
                                <strong>{contact.displayName}</strong>
                                <small>
                                  {alreadyMember
                                    ? t("groupManagement.alreadyMember")
                                    : eligible
                                      ? (contact.employee?.designation ??
                                        roleLabel(contact.role, t))
                                      : contact.contactMode === "BLOCKED"
                                        ? t(
                                            "groupManagement.blockedPrivateContact",
                                          )
                                        : t(
                                            "privateGroup.firstContactApproval",
                                          )}
                                </small>
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                    <button
                      type="button"
                      className="message-modern-primary-action"
                      onClick={() => void handleAddGroupMembers()}
                      disabled={
                        groupSelectedAccountIds.length === 0 || groupSubmitting
                      }
                    >
                      {groupSubmitting
                        ? t("groupManagement.adding")
                        : t("groupManagement.addSelectedMembers")}
                    </button>
                  </section>
                )}
            </div>
          )}

          {groupPanelTab === "SETTINGS" && canOpenSettings && (
            <div className="message-modern-group-tab">
              <section className="message-modern-detail-section">
                <div className="message-modern-section-heading">
                  <h3>{t("groupManagement.groupDetails")}</h3>
                  <span>{t("groupManagement.editable")}</span>
                </div>

                <div className="message-modern-group-photo-setting">
                  {renderGroupAvatar(
                    groupInfoConversation,
                    "message-group-photo-preview",
                  )}
                  <div>
                    <strong>{t("groupManagement.groupPhoto")}</strong>
                    <small>{t("groupManagement.groupPhotoHint")}</small>
                    <div>
                      <input
                        ref={groupPhotoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        hidden
                        onChange={(event) => void handleGroupPhotoChange(event)}
                      />
                      <button
                        type="button"
                        onClick={() => groupPhotoInputRef.current?.click()}
                        disabled={groupPhotoUploading || groupSubmitting}
                      >
                        {groupPhotoUploading
                          ? t("groupManagement.uploading")
                          : groupInfoConversation.groupPhotoKey
                            ? t("groupManagement.changePhoto")
                            : t("groupManagement.uploadPhoto")}
                      </button>
                      {groupInfoConversation.groupPhotoKey && (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void handleRemoveGroupPhoto()}
                          disabled={groupPhotoUploading || groupSubmitting}
                        >
                          {t("groupManagement.remove")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <label className="message-modern-field">
                  <span>{t("groupCreateWorkspace.groupName")}</span>
                  <input
                    type="text"
                    value={groupTitle}
                    onChange={(event) => setGroupTitle(event.target.value)}
                    maxLength={150}
                  />
                </label>
                <label className="message-modern-field">
                  <span>{t("groupManagement.description")}</span>
                  <textarea
                    value={groupDescription}
                    onChange={(event) =>
                      setGroupDescription(event.target.value)
                    }
                    maxLength={500}
                    rows={3}
                    placeholder={t("groupManagement.descriptionPlaceholder")}
                  />
                </label>
                <button
                  type="button"
                  className="message-modern-primary-action"
                  onClick={() => void handleSaveGroupDetails()}
                  disabled={!groupTitle.trim() || groupSubmitting}
                >
                  {groupSubmitting
                    ? t("groupManagement.saving")
                    : t("groupManagement.saveDetails")}
                </button>
              </section>

              {groupInfoConversation.groupKind === "PERSONAL" && (
                <section className="message-modern-detail-section">
                  <div className="message-modern-section-heading">
                    <h3>{t("groupManagement.invitationLink")}</h3>
                    <span>{t("groupManagement.personalGroup")}</span>
                  </div>

                  {groupInviteLoading ? (
                    <p>{t("groupManagement.loadingInvite")}</p>
                  ) : groupInviteLink ? (
                    <>
                      <label className="message-modern-field">
                        <span>{t("groupManagement.activeLink")}</span>
                        <input value={groupInviteUrl} readOnly />
                      </label>
                      <div className="message-modern-inline-actions">
                        <button
                          type="button"
                          onClick={() => void handleCopyGroupInviteLink()}
                        >
                          {t("groupManagement.copy")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCreateGroupInviteLink()}
                        >
                          {t("groupManagement.reset")}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void handleRevokeGroupInviteLink()}
                        >
                          {t("groupManagement.revoke")}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>{t("groupManagement.noActiveInvite")}</p>
                      <button
                        type="button"
                        onClick={() => void handleCreateGroupInviteLink()}
                      >
                        {t("groupManagement.generateInvite")}
                      </button>
                    </>
                  )}

                  {groupInviteNotice && (
                    <small className="message-group-info-success">
                      {groupInviteNotice}
                    </small>
                  )}
                  {groupInviteError && (
                    <small className="message-group-info-danger">
                      {groupInviteError}
                    </small>
                  )}
                </section>
              )}

              {groupInfoConversation.groupKind === "OFFICIAL" && (
                <section className="message-modern-detail-section">
                  <div className="message-modern-section-heading">
                    <h3>{t("groupManagement.auditTitle")}</h3>
                    {officialGroupCanReconcileAll && (
                      <button
                        type="button"
                        onClick={() => void handleReconcileOfficialGroups()}
                        disabled={officialGroupReconciling}
                      >
                        {officialGroupReconciling
                          ? t("groupManagement.reconciling")
                          : t("groupManagement.reconcile")}
                      </button>
                    )}
                  </div>
                  {officialGroupAuditLoading ? (
                    <div className="message-list-state compact">
                      <span className="message-small-spinner" />
                      <p>{t("groupManagement.loadingAudit")}</p>
                    </div>
                  ) : officialGroupAudit.length === 0 ? (
                    <p>{t("groupManagement.noAudit")}</p>
                  ) : (
                    <div className="message-modern-audit-list">
                      {officialGroupAudit.map((entry) => (
                        <article key={entry.id}>
                          <strong>{officialAuditLabel(entry, t)}</strong>
                          <small>
                            {entry.actor?.displayName ??
                              t("groupManagement.system")}{" "}
                            · {notificationTimestampLabel(entry.createdAt)}
                          </small>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {groupInfoConversation.groupKind === "PERSONAL" && (
            <section className="message-modern-danger-zone">
              <button
                type="button"
                className="danger"
                onClick={() =>
                  openDestructiveConfirmation({
                    kind: "LEAVE_GROUP",
                    conversationId: groupInfoConversation.id,
                    conversationTitle:
                      groupInfoConversation.title ?? t("groupInfo.thisGroup"),
                  })
                }
                disabled={groupSubmitting}
              >
                {groupSubmitting
                  ? t("groupInfo.leaving")
                  : t("groupInfo.leaveGroup")}
              </button>
            </section>
          )}
        </div>
      </div>
    );
  }

  function renderPrivateGroupWorkspaceContent(): ReactNode {
    if (!selectedConversation || selectedConversation.type !== "PRIVATE") {
      return null;
    }

    const canCreatePrivateGroup =
      privateGroupSelectedAccountIds.length > 0 && !privateGroupSubmitting;

    return (
      <div className="message-add-members-workspace">
        <header className="message-create-flow-header">
          <button
            type="button"
            className="message-create-flow-back"
            onClick={closePrivateGroupDialog}
            disabled={privateGroupSubmitting}
            aria-label={t("privateGroup.back")}
            title={t("privateGroup.back")}
          >
            ←
          </button>
          <div>
            <span>{t("privateGroup.addMember")}</span>
            <h2>{t("privateGroup.title")}</h2>
            <p>{t("privateGroup.description")}</p>
          </div>
        </header>

        <div className="message-add-members-canvas">
          {privateGroupError && (
            <div className="message-inline-error compact" role="alert">
              <p>{privateGroupError}</p>
            </div>
          )}

          <div className="message-add-members-layout">
            <section className="message-add-members-people-panel">
              <header className="message-create-group-panel-header">
                <div>
                  <span>{t("privateGroup.people")}</span>
                  <h3>{t("privateGroup.chooseMembers")}</h3>
                  <p>{t("privateGroup.eligibleEmployees")}</p>
                </div>
                <strong>
                  {t("summary.selected", {
                    total: privateGroupSelectedAccountIds.length,
                  })}
                </strong>
              </header>

              <label className="message-create-group-search">
                <MessageNavigationIcon name="search" />
                <input
                  type="search"
                  value={privateGroupSearch}
                  onChange={(event) =>
                    setPrivateGroupSearch(event.target.value)
                  }
                  placeholder={t("privateGroup.searchEmployees")}
                  autoFocus
                />
              </label>

              {privateGroupSelectedContacts.length > 0 && (
                <div
                  className="message-create-group-selected-strip"
                  aria-label={t("privateGroup.selectedMembersAria")}
                >
                  {privateGroupSelectedContacts.map((contact) => (
                    <button
                      key={contact.accountId}
                      type="button"
                      onClick={() =>
                        togglePrivateGroupMember(contact.accountId, contact)
                      }
                      disabled={privateGroupSubmitting}
                      title={`Remove ${contact.displayName}`}
                    >
                      {renderAccountAvatar(
                        contact,
                        "message-avatar selected-member-avatar",
                      )}
                      <span>{contact.displayName}</span>
                      <em aria-hidden="true">×</em>
                    </button>
                  ))}
                </div>
              )}

              <div className="message-group-contact-list message-add-members-list">
                {privateGroupContactsLoading ? (
                  <div className="message-list-state compact" role="status">
                    <span
                      className="message-small-spinner"
                      aria-hidden="true"
                    />
                    <p>{t("groupManagement.searchingAccounts")}</p>
                  </div>
                ) : privateGroupContacts.length === 0 ? (
                  <div className="message-list-state compact" role="status">
                    <p>{t("groupManagement.noMatchingAccounts")}</p>
                  </div>
                ) : (
                  privateGroupContacts.map((contact) => {
                    const alreadyOriginalMember =
                      privateGroupOriginalMemberIds.has(contact.accountId);
                    const selected = privateGroupSelectedAccountIds.includes(
                      contact.accountId,
                    );
                    const eligible =
                      contact.contactMode === "DIRECT" &&
                      !alreadyOriginalMember;

                    return (
                      <label
                        key={contact.accountId}
                        className={`message-group-contact-row${
                          selected ? " selected" : ""
                        }${!eligible ? " disabled" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() =>
                            togglePrivateGroupMember(contact.accountId, contact)
                          }
                          disabled={!eligible || privateGroupSubmitting}
                        />

                        {renderAccountAvatar(contact, "message-avatar small")}

                        <span>
                          <strong>{contact.displayName}</strong>
                          <small>
                            {alreadyOriginalMember
                              ? t("privateGroup.alreadyInConversation")
                              : eligible
                                ? (contact.employee?.designation ??
                                  roleLabel(contact.role, t))
                                : contact.contactMode === "BLOCKED"
                                  ? t("groupManagement.blockedPrivateContact")
                                  : t("groupManagement.firstContactApproval")}
                          </small>
                        </span>

                        <span
                          className="message-create-group-member-state"
                          aria-hidden="true"
                        >
                          {selected ? "✓" : "+"}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </section>

            <aside className="message-add-members-setup-panel">
              <div className="message-create-group-panel-header compact">
                <div>
                  <span>{t("privateGroup.groupSetup")}</span>
                  <h3>{t("privateGroup.previousContext")}</h3>
                  <p>{t("privateGroup.historyDescription")}</p>
                </div>
              </div>

              <div className="message-add-members-history-options">
                {PRIVATE_GROUP_HISTORY_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={
                      privateGroupHistoryWindow === option.value ? "active" : ""
                    }
                  >
                    <input
                      type="radio"
                      name="private-group-history"
                      value={option.value}
                      checked={privateGroupHistoryWindow === option.value}
                      onChange={() =>
                        setPrivateGroupHistoryWindow(option.value)
                      }
                      disabled={privateGroupSubmitting}
                    />
                    <span>
                      <strong>{t(option.labelKey)}</strong>
                      <small>{t(option.descriptionKey)}</small>
                    </span>
                  </label>
                ))}
              </div>

              <div className="message-add-members-summary">
                <span>{t("privateGroup.selectedMembers")}</span>
                <strong>{privateGroupSelectedAccountIds.length}</strong>
              </div>

              <div className="message-create-group-setup-actions">
                <button
                  type="button"
                  onClick={closePrivateGroupDialog}
                  disabled={privateGroupSubmitting}
                >
                  {t("actions.cancel")}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void handleCreatePrivateGroup()}
                  disabled={!canCreatePrivateGroup}
                >
                  {privateGroupSubmitting
                    ? t("privateGroup.creating")
                    : t("privateGroup.createGroup")}
                </button>
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  function renderCreateGroupWorkspaceContent(): ReactNode {
    const isOfficialGroup = groupKind === "OFFICIAL";
    const canSubmitGroup =
      Boolean(groupTitle.trim()) &&
      !groupSubmitting &&
      (isOfficialGroup
        ? Boolean(selectedOfficialGroupScope)
        : groupSelectedAccountIds.length > 0);

    return (
      <div className="message-create-group-workspace">
        <header className="message-create-flow-header">
          <button
            type="button"
            className="message-create-flow-back"
            onClick={closeGroupDialog}
            aria-label={t("groupCreateWorkspace.backToGroups")}
            title={t("groupCreateWorkspace.backToGroups")}
          >
            ←
          </button>
          <div>
            <span>{t("groupCreateWorkspace.newGroup")}</span>
            <h2>
              {isOfficialGroup
                ? t("groupCreateWorkspace.officialTitle")
                : t("groupCreateWorkspace.personalTitle")}
            </h2>
            <p>
              {isOfficialGroup
                ? t("groupCreateWorkspace.officialDescription")
                : t("groupCreateWorkspace.personalDescription")}
            </p>
          </div>
        </header>

        <div
          className={`message-create-group-canvas${
            isOfficialGroup ? " official-group" : ""
          }`}
        >
          {groupError && (
            <div className="message-inline-error compact" role="alert">
              <p>{groupError}</p>
            </div>
          )}

          <div className="message-create-group-layout">
            <section className="message-create-group-people-panel">
              <header className="message-create-group-panel-header">
                <div>
                  <span>
                    {isOfficialGroup
                      ? t("groupCreateWorkspace.membership")
                      : t("groupCreateWorkspace.people")}
                  </span>
                  <h3>
                    {isOfficialGroup
                      ? t("groupCreateWorkspace.chooseScope")
                      : t("groupCreateWorkspace.chooseMembers")}
                  </h3>
                  <p>
                    {isOfficialGroup
                      ? t("groupCreateWorkspace.officialMembersHint")
                      : t("privateGroup.eligibleEmployees")}
                  </p>
                </div>
                {!isOfficialGroup && (
                  <strong>
                    {t("summary.selected", {
                      total: groupSelectedAccountIds.length,
                    })}
                  </strong>
                )}
              </header>

              {isOfficialGroup ? (
                <div className="message-create-group-official-scope">
                  <div
                    className="message-create-group-scope-visual"
                    aria-hidden="true"
                  >
                    <MessageNavigationIcon name="newGroup" />
                  </div>
                  <label className="message-group-scope-field">
                    <span>{t("groupCreateWorkspace.organizationalScope")}</span>
                    <select
                      value={officialGroupScopeKey}
                      onChange={(event) => {
                        const nextKey = event.target.value;
                        const nextScope = officialGroupScopes.find(
                          (scope) => scope.key === nextKey,
                        );

                        setOfficialGroupScopeKey(nextKey);

                        if (nextScope && !groupTitle.trim()) {
                          setGroupTitle(nextScope.defaultTitle);
                        }
                      }}
                      disabled={officialGroupScopesLoading || groupSubmitting}
                    >
                      <option value="">
                        {officialGroupScopesLoading
                          ? t("groupCreateWorkspace.loadingScopes")
                          : t("groupCreateWorkspace.selectScope")}
                      </option>
                      {officialGroupScopes.map((scope) => (
                        <option key={scope.key} value={scope.key}>
                          {scope.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="message-create-group-scope-summary">
                    <span>{t("groupCreateWorkspace.membershipSource")}</span>
                    <strong>
                      {selectedOfficialGroupScope?.label ??
                        t("groupCreateWorkspace.noScopeSelected")}
                    </strong>
                    <small>
                      {t("groupCreateWorkspace.membershipControlled")}
                    </small>
                  </div>
                </div>
              ) : (
                <>
                  <label className="message-create-group-search">
                    <span className="sr-only">
                      {t("groupCreateWorkspace.searchEligibleEmployees")}
                    </span>
                    <input
                      type="search"
                      value={groupSearch}
                      onChange={(event) => setGroupSearch(event.target.value)}
                      placeholder={t("groupCreateWorkspace.searchPlaceholder")}
                    />
                  </label>

                  {!groupSearch.trim() && !groupContactsLoading && (
                    <p className="message-create-group-search-hint">
                      {t("groupCreateWorkspace.searchForMoreEmployees")}
                    </p>
                  )}

                  {groupSelectedContacts.length > 0 && (
                    <div
                      className="message-create-group-selected-strip"
                      aria-label={t("groupCreateWorkspace.selectedMembersAria")}
                    >
                      {groupSelectedContacts.map((contact) => (
                        <button
                          key={contact.accountId}
                          type="button"
                          onClick={() =>
                            toggleGroupMember(contact.accountId, contact)
                          }
                          disabled={groupSubmitting}
                          title={`Remove ${contact.displayName}`}
                        >
                          {renderAccountAvatar(
                            contact,
                            "message-avatar selected-member-avatar",
                          )}
                          <span>{contact.displayName}</span>
                          <em aria-hidden="true">×</em>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="message-group-contact-list message-create-group-member-list">
                    {groupContactsLoading && groupContacts.length === 0 ? (
                      <div className="message-list-state compact" role="status">
                        <span
                          className="message-small-spinner"
                          aria-hidden="true"
                        />
                        <p>{t("groupManagement.searchingAccounts")}</p>
                      </div>
                    ) : groupContacts.length === 0 ? (
                      <div className="message-list-state compact" role="status">
                        <p>{t("groupManagement.noMatchingAccounts")}</p>
                      </div>
                    ) : (
                      <>
                        {groupContactsLoading && (
                          <div
                            className="message-create-group-searching-inline"
                            role="status"
                            aria-live="polite"
                          >
                            <span
                              className="message-small-spinner"
                              aria-hidden="true"
                            />
                            <span>{t("groupManagement.searchingAccounts")}</span>
                          </div>
                        )}
                        {groupContacts.map((contact) => {
                          const selected = groupSelectedAccountIds.includes(
                            contact.accountId,
                          );
                          const eligible = contact.contactMode === "DIRECT";

                          return (
                            <label
                              key={contact.accountId}
                              className={`message-group-contact-row${
                                selected ? " selected" : ""
                              }${!eligible ? " disabled" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() =>
                                  toggleGroupMember(contact.accountId, contact)
                                }
                                disabled={!eligible || groupSubmitting}
                              />

                              {renderAccountAvatar(
                                contact,
                                "message-avatar small",
                              )}

                              <span>
                                <strong>{contact.displayName}</strong>
                                <small>
                                  {eligible
                                    ? (contact.employee?.designation ??
                                      roleLabel(contact.role, t))
                                    : contact.contactMode === "BLOCKED"
                                      ? "Blocked private contact"
                                      : t("privateGroup.firstContactApproval")}
                                </small>
                              </span>

                              <span
                                className="message-create-group-member-state"
                                aria-hidden="true"
                              >
                                {selected ? "✓" : "+"}
                              </span>
                            </label>
                          );
                        })}
                      </>
                    )}
                  </div>
                </>
              )}
            </section>

            <aside className="message-create-group-setup-panel">
              <div className="message-create-group-panel-header compact">
                <div>
                  <span>{t("privateGroup.groupSetup")}</span>
                  <h3>{t("groupCreateWorkspace.identityAndType")}</h3>
                  <p>{t("groupCreateWorkspace.identityHint")}</p>
                </div>
              </div>

              {canCreateOfficialGroup && (
                <fieldset className="message-create-group-type-field">
                  <legend>{t("groupCreateWorkspace.groupType")}</legend>
                  <div className="message-group-kind-options">
                    <button
                      type="button"
                      className={groupKind === "PERSONAL" ? "active" : ""}
                      onClick={() => {
                        setGroupKind("PERSONAL");
                        setGroupError(null);
                      }}
                      disabled={groupSubmitting}
                    >
                      <strong>{t("groupCreateWorkspace.personal")}</strong>
                      <small>
                        {t("groupCreateWorkspace.chooseMembersShort")}
                      </small>
                    </button>

                    <button
                      type="button"
                      className={groupKind === "OFFICIAL" ? "active" : ""}
                      onClick={() => {
                        const defaultScope =
                          selectedOfficialGroupScope ??
                          officialGroupScopes[0] ??
                          null;

                        setGroupKind("OFFICIAL");
                        setGroupSelectedAccountIds([]);
                        setGroupSelectedContacts([]);

                        if (defaultScope) {
                          setOfficialGroupScopeKey(defaultScope.key);
                          setGroupTitle((current) =>
                            current.trim()
                              ? current
                              : defaultScope.defaultTitle,
                          );
                        }

                        setGroupError(null);
                      }}
                      disabled={groupSubmitting || officialGroupScopesLoading}
                    >
                      <strong>{t("groupCreateWorkspace.official")}</strong>
                      <small>{t("groupCreateWorkspace.useScope")}</small>
                    </button>
                  </div>
                </fieldset>
              )}

              <div className="message-create-group-fields">
                <label>
                  <span>{t("groupCreateWorkspace.groupName")}</span>
                  <input
                    type="text"
                    value={groupTitle}
                    onChange={(event) => setGroupTitle(event.target.value)}
                    maxLength={150}
                    placeholder={t("groupCreateWorkspace.groupNamePlaceholder")}
                    autoFocus={isOfficialGroup}
                  />
                </label>

                <label>
                  <span>
                    {t("groupCreateWorkspace.description")}{" "}
                    <em>{t("groupCreateWorkspace.optional")}</em>
                  </span>
                  <textarea
                    value={groupDescription}
                    onChange={(event) =>
                      setGroupDescription(event.target.value)
                    }
                    maxLength={500}
                    rows={4}
                    placeholder={t(
                      "groupCreateWorkspace.descriptionPlaceholder",
                    )}
                  />
                </label>
              </div>

              <div className="message-create-group-status-card">
                <div>
                  <span>{t("groupCreateWorkspace.groupType")}</span>
                  <strong>{isOfficialGroup ? "Official" : "Personal"}</strong>
                </div>
                <div>
                  <span>
                    {isOfficialGroup
                      ? t("groupCreateWorkspace.scope")
                      : t("groupCreateWorkspace.members")}
                  </span>
                  <strong>
                    {isOfficialGroup
                      ? (selectedOfficialGroupScope?.label ??
                        t("groupCreateWorkspace.notSelected"))
                      : groupSelectedAccountIds.length}
                  </strong>
                </div>
              </div>

              <div className="message-create-group-setup-actions">
                <button
                  type="button"
                  onClick={closeGroupDialog}
                  disabled={groupSubmitting}
                >
                  {t("actions.cancel")}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void handleCreateGroup()}
                  disabled={!canSubmitGroup}
                >
                  {groupSubmitting
                    ? t("groupCreateWorkspace.creating")
                    : isOfficialGroup
                      ? t("groupCreateWorkspace.createOfficialGroup")
                      : t("groupCreateWorkspace.createGroup")}
                </button>
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  function renderMessageListWorkspaceContent(): ReactNode {
    if (
      listMode &&
      !selectedChatFolder &&
      (chatFoldersLoading || (!chatFoldersError && !listWorkspaceError))
    ) {
      return (
        <div className="message-list-workspace">
          <div className="message-list-workspace-state" role="status">
            <span className="message-small-spinner" aria-hidden="true" />
            <strong>{t("listWorkspace.loadingList")}</strong>
          </div>
        </div>
      );
    }

    if (listMode && !selectedChatFolder) {
      return (
        <div className="message-list-workspace">
          <header className="message-list-workspace-header">
            <button
              type="button"
              className="message-mobile-back"
              onClick={() => navigate("/messages")}
              aria-label={t("navigation.backToChats")}
            >
              ←
            </button>
            <div>
              <span>{t("listWorkspace.myLists")}</span>
              <h2>{t("listWorkspace.unavailable")}</h2>
              <p>{t("listWorkspace.unavailableDescription")}</p>
            </div>
            <button
              type="button"
              className="message-workspace-close-action"
              onClick={() => navigate("/messages")}
            >
              {t("navigation.backToChats")}
            </button>
          </header>
          <div className="message-list-workspace-body">
            <div className="message-list-workspace-state danger" role="alert">
              <strong>
                {chatFoldersError ??
                  listWorkspaceError ??
                  t("listWorkspace.notFound")}
              </strong>
              <button
                type="button"
                onClick={() => {
                  setListWorkspaceError(null);
                  void loadChatFolders();
                }}
              >
                {t("actions.retry")}
              </button>
            </div>
          </div>
        </div>
      );
    }

    const editingExistingList = listEditMode && Boolean(selectedChatFolder);
    const selectedCount = listSelectedConversationIds.length;

    return (
      <div className="message-list-workspace">
        <header className="message-list-workspace-header">
          <button
            type="button"
            className="message-mobile-back"
            onClick={() =>
              listEditMode && selectedListId
                ? navigate(`/messages/lists/${selectedListId}`)
                : navigate("/messages")
            }
            aria-label={
              listEditMode
                ? t("listWorkspace.backToListConversations")
                : t("navigation.backToChats")
            }
          >
            ←
          </button>
          <div>
            <span>{t("listWorkspace.messages")}</span>
            <h2>
              {listCreateMode
                ? t("listWorkspace.createList")
                : t("listWorkspace.manageList")}
            </h2>
          </div>
          <button
            type="button"
            className="message-workspace-close-action"
            onClick={() =>
              listEditMode && selectedListId
                ? navigate(`/messages/lists/${selectedListId}`)
                : navigate("/messages")
            }
          >
            {listEditMode
              ? t("listWorkspace.backToList")
              : t("navigation.backToChats")}
          </button>
        </header>

        <form
          className="message-list-workspace-body"
          onSubmit={(event) => void handleSaveMessageList(event)}
        >
          <section className="message-list-editor-card">
            <div className="message-list-editor-heading">
              <div>
                <h3>{t("listWorkspace.listName")}</h3>
              </div>
              <small>{listNameDraft.length}/100</small>
            </div>

            <label className="message-list-name-field">
              <span>{t("listWorkspace.listName")}</span>
              <input
                type="text"
                value={listNameDraft}
                maxLength={100}
                autoComplete="off"
                placeholder={t("listWorkspace.namePlaceholder")}
                onChange={(event) => {
                  setListNameDraft(event.target.value);
                  setListWorkspaceError(null);
                }}
                disabled={listSaving || listDeleting}
                autoFocus={listCreateMode}
              />
            </label>
          </section>

          <section className="message-list-editor-card message-list-members-card">
            <div className="message-list-editor-heading">
              <div>
                <h3>{t("listWorkspace.peopleAndGroups")}</h3>
              </div>
              <strong>{t("summary.selected", { total: selectedCount })}</strong>
            </div>

            <label className="message-list-picker-search">
              <span className="sr-only">{t("listWorkspace.searchAria")}</span>
              <MessageNavigationIcon name="search" />
              <input
                type="search"
                value={listCandidateSearch}
                placeholder={t("listWorkspace.searchPlaceholder")}
                onChange={(event) => setListCandidateSearch(event.target.value)}
                disabled={listCandidatesLoading || listSaving || listDeleting}
              />
              {listCandidateSearch && (
                <button
                  type="button"
                  onClick={() => setListCandidateSearch("")}
                  aria-label={t("listWorkspace.clearSearch")}
                >
                  ×
                </button>
              )}
            </label>

            <div
              className="message-list-picker"
              aria-busy={listCandidatesLoading}
            >
              {listCandidatesLoading ? (
                <div className="message-list-workspace-state" role="status">
                  <span className="message-small-spinner" aria-hidden="true" />
                  <strong>{t("listWorkspace.loadingConversations")}</strong>
                </div>
              ) : filteredListCandidateConversations.length === 0 ? (
                <div className="message-list-workspace-state">
                  <MessageNavigationIcon name="chats" />
                  <strong>
                    {listCandidateSearch.trim()
                      ? t("listWorkspace.noMatchingConversations")
                      : t("listWorkspace.noConversations")}
                  </strong>
                  <small>{t("listWorkspace.emptyHint")}</small>
                </div>
              ) : (
                filteredListCandidateConversations.map((conversation) => {
                  const peer = conversationPeerFor(conversation);
                  const checked = listSelectedConversationIds.includes(
                    conversation.id,
                  );
                  const category =
                    conversation.type === "PRIVATE"
                      ? t("listWorkspace.privateChat")
                      : conversation.groupKind === "OFFICIAL"
                        ? t("listWorkspace.officialGroup")
                        : t("listWorkspace.personalGroup");
                  const secondary =
                    conversation.type === "PRIVATE"
                      ? (peer?.employee?.designation ??
                        roleLabel(peer?.role ?? "EMPLOYEE", t))
                      : t("profileDetail.membersCount", {
                          count: conversation.memberCount,
                        });

                  return (
                    <label
                      key={conversation.id}
                      className={`message-list-picker-row${checked ? " selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleListConversation(conversation.id)}
                        disabled={listSaving || listDeleting}
                      />
                      <span className="message-avatar-presence">
                        {peer
                          ? renderAccountAvatar(peer)
                          : renderGroupAvatar(conversation)}
                      </span>
                      <span className="message-list-picker-copy">
                        <strong>
                          {conversation.title ??
                            t("listWorkspace.privateConversation")}
                        </strong>
                        <small>
                          {category} · {secondary}
                        </small>
                      </span>
                      <span
                        className="message-list-picker-check"
                        aria-hidden="true"
                      >
                        {checked ? "✓" : ""}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </section>

          {listWorkspaceError && (
            <div
              className="message-list-workspace-feedback danger"
              role="alert"
            >
              {listWorkspaceError}
            </div>
          )}

          <div className="message-list-workspace-actions">
            {editingExistingList && listDeleteConfirmOpen ? (
              <div
                className="message-list-delete-confirm"
                role="group"
                aria-label={t("listWorkspace.confirmDeleteAria")}
              >
                <span>
                  {t("listWorkspace.deleteConfirmation", {
                    name: selectedChatFolder?.name ?? "",
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => setListDeleteConfirmOpen(false)}
                  disabled={listDeleting}
                >
                  {t("actions.cancel")}
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => void handleDeleteMessageList()}
                  disabled={listDeleting}
                >
                  {listDeleting
                    ? t("listWorkspace.deleting")
                    : t("listWorkspace.deleteList")}
                </button>
              </div>
            ) : (
              <>
                {editingExistingList && (
                  <button
                    type="button"
                    className="message-list-delete-trigger"
                    onClick={() => setListDeleteConfirmOpen(true)}
                    disabled={listSaving || listDeleting}
                  >
                    {t("listWorkspace.deleteList")}
                  </button>
                )}
                <div className="message-list-selection-summary">
                  <strong>
                    {t("summary.selected", { total: selectedCount })}
                  </strong>
                </div>
                <button
                  type="submit"
                  className="primary"
                  disabled={
                    listSaving ||
                    listDeleting ||
                    listCandidatesLoading ||
                    !listNameDraft.trim()
                  }
                >
                  {listSaving
                    ? t("listWorkspace.saving")
                    : listCreateMode
                      ? t("listWorkspace.createList")
                      : t("listWorkspace.saveChanges")}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    );
  }

  function renderMessageListOverviewContent(): ReactNode {
    if (!selectedChatFolder) {
      return null;
    }

    const conversationCount = selectedChatFolder.items.filter(
      (item) => item.conversationId,
    ).length;

    return (
      <div className="message-collection-welcome-state message-list-welcome-state">
        <span
          className="message-collection-welcome-icon message-list-welcome-brand"
          aria-hidden="true"
        >
          <MessageNavigationIcon name="chats" />
        </span>
        <h2>{t("listOverview.selectConversation")}</h2>
        <p>
          {conversationCount === 0
            ? t("listOverview.empty", { name: selectedChatFolder.name })
            : t("listOverview.choose", { name: selectedChatFolder.name })}
        </p>
      </div>
    );
  }

  const resolvedMessagingTheme = resolveMessagingTheme(
    messagingCustomization.theme,
    systemPrefersDark,
  );
  const workspaceDetailOpen = listCreateMode
    ? true
    : listMode
      ? Boolean(selectedConversation || listEditMode)
      : newConversationMode
        ? false
        : Boolean(
            selectedConversation ||
            (requestMode && selectedMessageRequest) ||
            settingsMode ||
            ownProfileMode ||
            createGroupMode,
          );

  const sidebarTitle = announcementMode
    ? t("sidebar.titles.announcements")
    : requestMode
      ? t("sidebar.titles.requests")
      : starredMode
        ? t("sidebar.titles.starred")
        : archivedMode
          ? t("sidebar.titles.archived")
          : notificationMode
            ? t("sidebar.titles.notifications")
            : settingsMode
              ? t("sidebar.titles.settings")
              : ownProfileMode
                ? t("sidebar.titles.profile")
                : newConversationMode
                  ? t("sidebar.titles.newConversation")
                  : createGroupMode
                    ? t("sidebar.titles.createGroup")
                    : listCreateMode
                      ? t("sidebar.titles.createList")
                      : conversationCategory === "GROUPS" ||
                          conversationCategory === "OFFICIAL"
                        ? t("sidebar.titles.groups")
                        : t("sidebar.titles.conversations");

  function renderStorageUsageWorkspaceContent(): ReactNode {
    if (!storageUsageScope) {
      return null;
    }

    const conversationScoped = storageUsageScope.kind === "CONVERSATION";
    const conversationTitle =
      storageUsage?.scope === "CONVERSATION"
        ? (storageUsage.conversation.title ??
          conversations.find(
            (conversation) => conversation.id === storageUsage.conversation.id,
          )?.title ??
          (storageUsage.conversation.type === "GROUP"
            ? t("storageWorkspace.groupStorage")
            : t("storageWorkspace.privateChatStorage")))
        : null;

    return (
      <div className="message-storage-workspace">
        <header className="message-storage-workspace-header">
          <button
            type="button"
            className="message-mobile-back"
            onClick={handleStorageWorkspaceBack}
            aria-label={
              conversationScoped
                ? t("storageWorkspace.backToAll")
                : t("storageWorkspace.backToSettings")
            }
          >
            ←
          </button>
          <div>
            <span>{t("storageWorkspace.eyebrow")}</span>
            <h2>
              {conversationScoped
                ? conversationTitle
                : t("storageWorkspace.title")}
            </h2>
            <p>
              {conversationScoped
                ? t("storageWorkspace.conversationDescription")
                : t("storageWorkspace.accountDescription")}
            </p>
          </div>
          <button
            type="button"
            className="message-workspace-close-action"
            onClick={handleStorageWorkspaceBack}
          >
            {conversationScoped
              ? t("storageWorkspace.allStorage")
              : t("storageWorkspace.backToSettingsShort")}
          </button>
        </header>

        <div className="message-storage-workspace-scroll">
          {storageUsageLoading && !storageUsage ? (
            <div className="message-storage-state" role="status">
              <span className="message-small-spinner" aria-hidden="true" />
              <strong>{t("storageWorkspace.loading")}</strong>
            </div>
          ) : storageUsageError && !storageUsage ? (
            <div className="message-storage-state error" role="alert">
              <MessageNavigationIcon name="storage" />
              <strong>{t("storageWorkspace.loadError")}</strong>
              <small>{storageUsageError}</small>
              <button
                type="button"
                onClick={() => void loadStorageUsage(storageUsageScope)}
              >
                {t("actions.retry")}
              </button>
            </div>
          ) : storageUsage ? (
            <div className="message-storage-content">
              {storageUsageLoading && (
                <div className="message-storage-refreshing" role="status">
                  <span className="message-small-spinner" aria-hidden="true" />
                  {t("storageWorkspace.updating")}
                </div>
              )}

              {storageUsageError && (
                <div className="message-storage-inline-error" role="alert">
                  <span>{storageUsageError}</span>
                </div>
              )}

              <section
                className="message-storage-overview"
                aria-label={t("storageWorkspace.overviewAria")}
              >
                <div className="message-storage-total">
                  <span>{t("storageWorkspace.totalStorage")}</span>
                  <strong>
                    {formatFileSize(storageUsage.totals.logicalVisibleBytes)}
                  </strong>
                  <small>
                    {t("storageWorkspace.filesCount", {
                      count: storageUsage.totals.logicalItemCount,
                    })}
                  </small>
                </div>

                <div className="message-storage-category-grid">
                  {storageUsage.categories.map((category) => (
                    <article key={category.key}>
                      <span
                        className={`message-storage-category-icon ${category.key.toLowerCase()}`}
                        aria-hidden="true"
                      >
                        {category.label.slice(0, 1)}
                      </span>
                      <div>
                        <strong>
                          {t(
                            `storageWorkspace.categories.${category.key.toLowerCase()}`,
                          )}
                        </strong>
                        <small>
                          {t("storageWorkspace.itemsCount", {
                            count: category.itemCount,
                          })}
                        </small>
                      </div>
                      <b>{formatFileSize(category.logicalBytes)}</b>
                    </article>
                  ))}
                </div>
              </section>

              {storageUsage.scope === "USER" && (
                <section className="message-storage-section">
                  <header>
                    <h3>{t("storageWorkspace.chats")}</h3>
                    <small>
                      {t("storageWorkspace.chatsWithFiles", {
                        count: storageUsage.storageByConversation.length,
                      })}
                    </small>
                  </header>
                  {storageUsage.storageByConversation.length === 0 ? (
                    <p className="message-storage-empty">
                      {t("storageWorkspace.noChatFiles")}
                    </p>
                  ) : (
                    <div className="message-storage-conversation-list">
                      {storageUsage.storageByConversation.map((item) => (
                        <button
                          key={item.conversationId}
                          type="button"
                          onClick={() =>
                            openStorageUsage({
                              kind: "CONVERSATION",
                              conversationId: item.conversationId,
                            })
                          }
                        >
                          <span className="message-storage-conversation-avatar">
                            {(
                              item.conversationTitle ??
                              t("storageWorkspace.conversationFallback")
                            )
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                          <span>
                            <strong>
                              {item.conversationTitle ??
                                (item.conversationType === "GROUP"
                                  ? t("storageWorkspace.groupChat")
                                  : t("storageWorkspace.privateChat"))}
                            </strong>
                            <small>
                              {t("storageWorkspace.filesCount", {
                                count: item.itemCount,
                              })}
                            </small>
                          </span>
                          <b>{formatFileSize(item.logicalBytes)}</b>
                          <span
                            className="message-storage-row-chevron"
                            aria-hidden="true"
                          >
                            ›
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

              <section className="message-storage-section message-storage-largest-section">
                <header>
                  <h3>{t("storageWorkspace.largeFiles")}</h3>
                  <small>{t("storageWorkspace.largestFirst")}</small>
                </header>

                {storageUsage.largestFiles.length === 0 ? (
                  <p className="message-storage-empty">
                    {t("storageWorkspace.noFiles")}
                  </p>
                ) : (
                  <div className="message-storage-file-list">
                    {storageUsage.largestFiles.map((file) => {
                      const actionPending =
                        storageUsageActionId?.endsWith(file.attachmentId) ??
                        false;
                      const deleteConfirmation =
                        storageDeleteConfirmation?.attachmentId ===
                        file.attachmentId
                          ? storageDeleteConfirmation
                          : null;

                      return (
                        <article key={file.attachmentId}>
                          <span
                            className={`message-storage-file-type ${file.contentType.toLowerCase()}`}
                            aria-hidden="true"
                          >
                            {file.contentType === "FILE"
                              ? "DOC"
                              : file.contentType.slice(0, 3)}
                          </span>
                          <div className="message-storage-file-copy">
                            <div>
                              <strong title={file.originalFileName}>
                                {file.originalFileName}
                              </strong>
                              <b>{formatFileSize(file.fileSizeBytes)}</b>
                            </div>
                            <small>
                              {storageUsage.scope === "USER" &&
                                `${file.conversationTitle ?? t("storageWorkspace.conversationFallback")} · `}
                              {file.sender.displayName} ·{" "}
                              {formatConversationTime(file.sentAt)}
                            </small>
                          </div>
                          <div className="message-storage-file-actions">
                            <button
                              type="button"
                              onClick={() =>
                                void openStorageOriginalMessage(file)
                              }
                              disabled={actionPending}
                            >
                              {t("storageWorkspace.open")}
                            </button>

                            {deleteConfirmation ? (
                              <div
                                className="message-storage-inline-confirmation"
                                role="status"
                              >
                                <span>
                                  {deleteConfirmation.mode === "EVERYONE"
                                    ? t("storageWorkspace.deleteForEveryone")
                                    : t("storageWorkspace.deleteForYou")}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setStorageDeleteConfirmation(null)
                                  }
                                  disabled={actionPending}
                                >
                                  {t("storageWorkspace.cancel")}
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() =>
                                    void handleStorageFileDelete(
                                      file,
                                      deleteConfirmation.mode,
                                    )
                                  }
                                  disabled={actionPending}
                                >
                                  {t("storageWorkspace.delete")}
                                </button>
                              </div>
                            ) : (
                              <>
                                {file.canDeleteForMe && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setStorageDeleteConfirmation({
                                        attachmentId: file.attachmentId,
                                        mode: "ME",
                                      })
                                    }
                                    disabled={actionPending}
                                  >
                                    {t("storageWorkspace.deleteForMeAction")}
                                  </button>
                                )}
                                {file.canDeleteForEveryone && (
                                  <button
                                    type="button"
                                    className="danger"
                                    onClick={() =>
                                      setStorageDeleteConfirmation({
                                        attachmentId: file.attachmentId,
                                        mode: "EVERYONE",
                                      })
                                    }
                                    disabled={actionPending}
                                  >
                                    {t(
                                      "storageWorkspace.deleteForEveryoneAction",
                                    )}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <footer className="message-storage-privacy-note">
                <MessageNavigationIcon name="official" />
                <span>{t("storageWorkspace.accessNote")}</span>
              </footer>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <main
      className={`message-app-shell${navigationExpanded ? " navigation-expanded" : ""}${announcementComposerOpen || announcementDetailOpen ? " announcement-workspace-active" : ""} theme-${customizationToken(resolvedMessagingTheme)} accent-blue wallpaper-${customizationToken(messagingCustomization.wallpaper)} density-${customizationToken(messagingCustomization.density)}${messagingCustomization.reduceMotion ? " motion-reduced" : ""}`}
    >
      <header
        className="message-app-topbar"
        onClickCapture={handleNavigationClickCapture}
      >
        <div className="message-rail-brand-row">
          <div className="message-brand-lockup">
            <button
              type="button"
              className="message-app-brand"
              onClick={() => navigate("/messages")}
              aria-label={t("brand.open")}
            >
              <span className="message-app-logo">
                <img src="/nt-logo.png" alt={t("brand.organization")} />
              </span>
            </button>

            <span
              className="message-brand-text"
              aria-hidden={!navigationExpanded}
            >
              <strong>NT Message</strong>
              <small>{t("brand.organization").toUpperCase()}</small>
            </span>
          </div>

          <button
            type="button"
            className="message-rail-toggle"
            onClick={() => setNavigationExpanded((current) => !current)}
            aria-expanded={navigationExpanded}
            aria-label={
              navigationExpanded
                ? t("navigation.collapse")
                : t("navigation.expand")
            }
            title={
              navigationExpanded
                ? t("navigation.collapse")
                : t("navigation.expand")
            }
          >
            <span aria-hidden="true">{navigationExpanded ? "‹" : "›"}</span>
          </button>
        </div>

        <nav
          className="message-rail-navigation"
          aria-label={t("navigation.sectionsAria")}
        >
          <button
            type="button"
            className={
              !announcementMode &&
              !starredMode &&
              !archivedMode &&
              !requestMode &&
              !notificationMode &&
              !settingsMode &&
              !ownProfileMode &&
              !createGroupMode &&
              (newConversationMode ||
                listWorkspaceMode ||
                (conversationCategory === "ALL" &&
                  (conversationListView === "ACTIVE" ||
                    conversationListView === "FAVORITES")))
                ? "active"
                : ""
            }
            onClick={() => {
              navigate("/messages");
              setConversationCategory("ALL");
              setConversationListView("ACTIVE");
            }}
            aria-label={t("navigation.chats")}
            title={navigationExpanded ? undefined : t("navigation.chats")}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="chats" />
            </span>
            <span className="message-rail-label">{t("navigation.chats")}</span>
          </button>

          <button
            type="button"
            className={announcementMode ? "active" : ""}
            onClick={() => navigate("/messages/announcements")}
            aria-label={t("navigation.officialAnnouncements")}
            title={
              navigationExpanded
                ? undefined
                : t("navigation.officialAnnouncements")
            }
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="announcement" />
            </span>
            <span className="message-rail-label">
              {t("navigation.announcements")}
            </span>
          </button>

          <button
            type="button"
            className={requestMode ? "active" : ""}
            onClick={() => openMessageRequests("RECEIVED")}
            aria-label={t("navigation.messageRequests")}
            title={
              navigationExpanded ? undefined : t("navigation.messageRequests")
            }
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="requests" />
            </span>
            <span className="message-rail-label">
              {t("navigation.messageRequests")}
            </span>
            {messageRequests.counts.receivedPending > 0 && (
              <b>{messageRequests.counts.receivedPending}</b>
            )}
          </button>

          <button
            type="button"
            className={
              !announcementMode &&
              !starredMode &&
              !archivedMode &&
              !requestMode &&
              !notificationMode &&
              !settingsMode &&
              !ownProfileMode &&
              !listWorkspaceMode &&
              (createGroupMode ||
                ((conversationCategory === "GROUPS" ||
                  conversationCategory === "OFFICIAL") &&
                  conversationListView === "ACTIVE"))
                ? "active"
                : ""
            }
            onClick={() => {
              navigate("/messages");
              setConversationCategory("GROUPS");
              setConversationListView("ACTIVE");
            }}
            aria-label={t("navigation.groups")}
            title={navigationExpanded ? undefined : t("navigation.groups")}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="groups" />
            </span>
            <span className="message-rail-label">{t("navigation.groups")}</span>
          </button>

          <button
            type="button"
            className={starredMode ? "active" : ""}
            onClick={() => navigate("/messages/starred")}
            aria-label={t("navigation.starredMessages")}
            title={
              navigationExpanded ? undefined : t("navigation.starredMessages")
            }
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="starred" />
            </span>
            <span className="message-rail-label">
              {t("navigation.starredMessages")}
            </span>
          </button>

          <button
            type="button"
            className={archivedMode ? "active" : ""}
            onClick={() => {
              navigate("/messages/archived");
              setConversationCategory("ALL");
              setConversationListView("ARCHIVED");
            }}
            aria-label={t("navigation.archivedConversations")}
            title={navigationExpanded ? undefined : t("navigation.archived")}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="archive" />
            </span>
            <span className="message-rail-label">
              {t("navigation.archived")}
            </span>
          </button>
        </nav>

        <div className="message-app-account">
          <button
            type="button"
            className={`message-profile-topbar-button${ownProfileMode || profileAccountId === account?.id ? " active" : ""}`}
            onClick={() => openProfile(account?.id)}
            title={navigationExpanded ? undefined : t("navigation.myProfile")}
          >
            {account ? (
              renderIdentityAvatar(
                account.id,
                account.displayName,
                "message-profile-rail-avatar",
              )
            ) : (
              <span className="message-profile-rail-avatar" aria-hidden="true">
                NT
              </span>
            )}
            <span className="message-profile-rail-copy">
              <strong>
                {account?.displayName ?? t("profile.userFallback")}
              </strong>
              <small>
                {account ? roleLabel(account.role, t) : t("profile.employee")}
              </small>
            </span>
          </button>

          <button
            type="button"
            className={`message-settings-button${settingsMode ? " active" : ""}`}
            onClick={() => openSettingsWorkspace()}
            aria-current={settingsMode ? "page" : undefined}
            title={navigationExpanded ? undefined : t("navigation.settings")}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="settings" />
            </span>
            <span className="message-rail-label">
              {t("navigation.settings")}
            </span>
          </button>

          <button
            type="button"
            className={`message-notification-button${notificationMode ? " active" : ""}`}
            onClick={openNotificationsWorkspace}
            aria-current={notificationMode ? "page" : undefined}
            aria-label={t("navigation.openNotifications")}
            title={
              navigationExpanded ? undefined : t("navigation.notifications")
            }
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="bell" />
            </span>
            <span className="message-rail-label">
              {t("navigation.notifications")}
            </span>
            {notificationUnreadCount > 0 && (
              <b>
                {notificationUnreadCount > 99 ? "99+" : notificationUnreadCount}
              </b>
            )}
          </button>

          <button
            type="button"
            className="message-workspace-return"
            onClick={() => navigate(mainWorkspacePath)}
            title={
              navigationExpanded
                ? undefined
                : t("navigation.backToMainWorkspace")
            }
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="workspace" />
            </span>
            <span className="message-rail-label">
              {t("navigation.backToWorkspace")}
            </span>
          </button>

          <button
            type="button"
            className="message-app-logout"
            onClick={handleLogout}
            disabled={loggingOut}
            title={navigationExpanded ? undefined : t("navigation.signOut")}
          >
            <span className="message-rail-icon">
              <MessageNavigationIcon name="logout" />
            </span>
            <span className="message-rail-label">
              {loggingOut
                ? t("navigation.signingOut")
                : t("navigation.signOut")}
            </span>
          </button>
        </div>
      </header>

      {navigationExpanded && (
        <button
          type="button"
          className="message-rail-scrim"
          onClick={() => setNavigationExpanded(false)}
          aria-label={t("navigation.closeMessagingNavigation")}
        />
      )}

      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {realtimeLabel}
      </div>

      {conversationHistoryToast && (
        <div
          className="message-conversation-history-toast"
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true">✓</span>
          <strong>{conversationHistoryToast}</strong>
          <button
            type="button"
            onClick={() => setConversationHistoryToast(null)}
            aria-label={t("actions.dismissConversationAction")}
          >
            ×
          </button>
        </div>
      )}

      {notificationToast && (
        <>
          <span
            className="sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {notificationToast.title}.{" "}
            {messagingSettings.notificationPreview
              ? notificationToast.body
              : t("notification.openToView")}
          </span>
          <button
            type="button"
            className="message-notification-toast"
            onClick={() => void handleNotificationClick(notificationToast)}
          >
            <strong>{notificationToast.title}</strong>
            <span>
              {messagingSettings.notificationPreview
                ? notificationToast.body
                : t("notification.openToView")}
            </span>
          </button>
        </>
      )}

      {mobileMessageActionMessage && (
        <div
          className="message-mobile-actions-backdrop"
          data-message-mobile-actions
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              closeTransientMessagePopups();
            }
          }}
        >
          {renderFloatingMessageActionMenu(
            mobileMessageActionMessage,
            "MOBILE_SHEET",
          )}
        </div>
      )}

      {reactionMenuMessage &&
        reactionMenuPosition &&
        renderFloatingReactionMenu(reactionMenuMessage)}

      {messageActionMenuMessage &&
        messageActionMenuAnchor &&
        renderFloatingMessageActionMenu(messageActionMenuMessage)}

      <section
        className={`message-workspace${
          workspaceDetailOpen ? " conversation-open" : ""
        }${
          (detailsPanelOpen || searchPanelOpen) &&
          selectedConversation &&
          !ownProfileMode &&
          !newConversationMode &&
          !createGroupMode &&
          !privateGroupDialogOpen
            ? " details-open"
            : ""
        }${createGroupMode ? " create-group-open" : ""}${listWorkspaceMode ? " list-workspace-open" : ""}${listManagementMode ? " list-management-open" : ""}${ownProfileMode ? " profile-workspace-open" : ""}${settingsMode ? " settings-workspace-open" : ""}${notificationMode ? " notification-workspace-open" : ""}`}
      >
        {/* Create Group owns the full workspace so form instructions and status
            are not duplicated in the conversation sidebar. */}
        {!createGroupMode &&
          !ownProfileMode &&
          !settingsMode &&
          !notificationMode &&
          !listManagementMode && (
            <aside
              className={`message-sidebar${
                !announcementMode &&
                !starredMode &&
                !archivedMode &&
                !requestMode &&
                !newConversationMode &&
                !listMode
                  ? " message-sidebar--conversation-home"
                  : ""
              }`}
            >
              <div className="message-sidebar-heading">
                <button
                  type="button"
                  className="message-mobile-menu-button"
                  onClick={() => setNavigationExpanded(true)}
                  aria-label={t("navigation.openMessagingNavigation")}
                  title={t("navigation.openNavigation")}
                >
                  <span aria-hidden="true">☰</span>
                </button>

                <div>
                  <span>{t("sidebar.eyebrow")}</span>
                  <h1>{sidebarTitle}</h1>
                </div>

                {notificationMode ||
                ownProfileMode ||
                newConversationMode ||
                createGroupMode ||
                listCreateMode ||
                listEditMode ? (
                  <button
                    type="button"
                    className="message-sidebar-back-action"
                    onClick={() => navigate("/messages")}
                    aria-label={t("navigation.backToChats")}
                    title={t("navigation.backToChats")}
                  >
                    ←
                  </button>
                ) : listMode ? (
                  <div className="message-sidebar-actions">
                    <button
                      type="button"
                      onClick={openSelectedListManager}
                      aria-label={t("sidebar.manageNamedList", {
                        name: selectedChatFolder?.name ?? t("sidebar.thisList"),
                      })}
                      title={t("sidebar.manageList")}
                    >
                      <MessageNavigationIcon name="edit" />
                    </button>
                  </div>
                ) : !announcementMode &&
                  !starredMode &&
                  !archivedMode &&
                  !requestMode &&
                  !settingsMode &&
                  !listWorkspaceMode ? (
                  <div className="message-sidebar-actions">
                    <button
                      type="button"
                      className="message-group-new-button"
                      onClick={openCreateGroup}
                      aria-label={t("sidebar.newGroupAria")}
                      title={t("sidebar.newGroup")}
                    >
                      <MessageNavigationIcon name="newGroup" />
                    </button>

                    <button
                      type="button"
                      className="message-new-button"
                      onClick={openNewConversation}
                      aria-label={t("sidebar.newConversationAria")}
                      title={t("sidebar.newConversation")}
                    >
                      <MessageNavigationIcon name="newChat" />
                    </button>
                  </div>
                ) : null}
              </div>

              {!settingsMode &&
                !ownProfileMode &&
                !createGroupMode &&
                !listManagementMode && (
                  <label className="message-conversation-search">
                    <span className="sr-only">
                      {newConversationMode
                        ? t("search.eligibleAccountsAria")
                        : announcementMode
                          ? t("search.officialGroups")
                          : requestMode
                            ? t("search.messageRequests")
                            : starredMode
                              ? t("search.starredMessages")
                              : archivedMode
                                ? t("search.archivedConversations")
                                : notificationMode
                                  ? t("search.notifications")
                                  : listMode
                                    ? t("search.inList", {
                                        name:
                                          selectedChatFolder?.name ??
                                          t("sidebar.thisList"),
                                      })
                                    : t("search.chats")}
                    </span>
                    <span
                      className="message-conversation-search-icon"
                      aria-hidden="true"
                    >
                      <MessageNavigationIcon name="search" />
                    </span>
                    <input
                      ref={
                        newConversationMode
                          ? undefined
                          : conversationSearchInputRef
                      }
                      type="text"
                      inputMode="search"
                      autoComplete="off"
                      value={
                        newConversationMode ? contactSearch : conversationSearch
                      }
                      onChange={(event) =>
                        newConversationMode
                          ? setContactSearch(event.target.value)
                          : setConversationSearch(event.target.value)
                      }
                      onKeyDown={
                        newConversationMode
                          ? undefined
                          : handleConversationSearchKeyDown
                      }
                      aria-keyshortcuts={
                        newConversationMode ? undefined : "Control+K Meta+K"
                      }
                      placeholder={
                        newConversationMode
                          ? t("search.people")
                          : announcementMode
                            ? t("search.officialGroups")
                            : requestMode
                              ? t("search.messageRequests")
                              : starredMode
                                ? t("search.starredMessages")
                                : archivedMode
                                  ? t("search.archivedConversations")
                                  : notificationMode
                                    ? t("search.notifications")
                                    : listMode
                                      ? t("search.inList", {
                                          name:
                                            selectedChatFolder?.name ??
                                            t("sidebar.thisList"),
                                        })
                                      : t("search.chats")
                      }
                      autoFocus={newConversationMode}
                    />
                    {(newConversationMode
                      ? contactSearch
                      : conversationSearch) && (
                      <button
                        type="button"
                        className="message-conversation-search-clear"
                        onClick={() =>
                          newConversationMode
                            ? setContactSearch("")
                            : setConversationSearch("")
                        }
                        aria-label={t("search.clear")}
                        title={t("search.clear")}
                      >
                        ×
                      </button>
                    )}
                  </label>
                )}

              {settingsMode ? (
                <nav
                  className="message-settings-workspace-navigation"
                  aria-label={t("messageSettings.sectionsAria")}
                >
                  {SETTINGS_TABS.map((tab) => (
                    <button
                      key={tab.value}
                      id={`message-settings-nav-${tab.value.toLowerCase()}`}
                      type="button"
                      className={settingsTab === tab.value ? "active" : ""}
                      aria-current={
                        settingsTab === tab.value ? "page" : undefined
                      }
                      onClick={() => setSettingsTab(tab.value)}
                    >
                      <span>{t(tab.labelKey)}</span>
                      <span aria-hidden="true">›</span>
                    </button>
                  ))}
                </nav>
              ) : ownProfileMode ? (
                <div className="message-profile-sidebar-summary">
                  <div className="message-profile-sidebar-avatar">
                    {profilePhotoUrl ? (
                      <img src={profilePhotoUrl} alt="" />
                    ) : (
                      initials(
                        profileData?.displayName ??
                          account?.displayName ??
                          "NT",
                      )
                    )}
                  </div>
                  <div>
                    <strong>
                      {profileData?.displayName ??
                        account?.displayName ??
                        t("profile.myProfile")}
                    </strong>
                    <span>
                      {profileData
                        ? roleLabel(profileData.role, t)
                        : account
                          ? roleLabel(account.role, t)
                          : t("profile.account")}
                    </span>
                  </div>
                  <p>{t("profileSidebar.description")}</p>
                </div>
              ) : createGroupMode ? (
                <div className="message-create-flow-sidebar">
                  <span
                    className="message-create-flow-sidebar-icon"
                    aria-hidden="true"
                  >
                    <MessageNavigationIcon name="newGroup" />
                  </span>
                  <strong>{t("groupCreate.sidebarTitle")}</strong>
                  <p>{t("groupCreate.sidebarDescription")}</p>
                  <dl>
                    <div>
                      <dt>{t("groupCreateWorkspace.groupType")}</dt>
                      <dd>
                        {groupKind === "OFFICIAL"
                          ? t("groupCreateWorkspace.official")
                          : t("groupCreateWorkspace.personal")}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("groupCreateWorkspace.members")}</dt>
                      <dd>
                        {groupKind === "OFFICIAL"
                          ? t("groupCreate.automatic")
                          : groupSelectedAccountIds.length}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : newConversationMode ? null : notificationMode ? (
                <div
                  className="message-conversation-category-tabs"
                  aria-label={t("filters.notificationFiltersAria")}
                >
                  <button
                    type="button"
                    className={notificationListView === "ALL" ? "active" : ""}
                    onClick={() => setNotificationListView("ALL")}
                  >
                    {t("filters.all")}
                  </button>
                  <button
                    type="button"
                    className={
                      notificationListView === "UNREAD" ? "active" : ""
                    }
                    onClick={() => setNotificationListView("UNREAD")}
                  >
                    {t("filters.unread")}
                    {notificationUnreadCount > 0
                      ? ` ${notificationUnreadCount}`
                      : ""}
                  </button>
                </div>
              ) : requestMode ? (
                <div
                  className="message-conversation-category-tabs"
                  aria-label={t("filters.requestFiltersAria")}
                >
                  <button
                    type="button"
                    className={requestListView === "RECEIVED" ? "active" : ""}
                    onClick={() => {
                      setRequestListView("RECEIVED");
                      setSelectedRequestId(null);
                    }}
                  >
                    {t("filters.received")}
                    {messageRequests.counts.receivedPending > 0
                      ? ` ${messageRequests.counts.receivedPending}`
                      : ""}
                  </button>
                  <button
                    type="button"
                    className={requestListView === "SENT" ? "active" : ""}
                    onClick={() => {
                      setRequestListView("SENT");
                      setSelectedRequestId(null);
                    }}
                  >
                    {t("filters.sent")}
                    {messageRequests.counts.sentPending > 0
                      ? ` ${messageRequests.counts.sentPending}`
                      : ""}
                  </button>
                </div>
              ) : !announcementMode &&
                !starredMode &&
                !archivedMode &&
                !listManagementMode ? (
                <div
                  className="message-conversation-filter-strip"
                  aria-label={
                    conversationCategory === "GROUPS" ||
                    conversationCategory === "OFFICIAL"
                      ? t("filters.groupFiltersAria")
                      : t("filters.conversationFiltersAria")
                  }
                >
                  {conversationCategory === "GROUPS" ||
                  conversationCategory === "OFFICIAL" ? (
                    <>
                      <button
                        type="button"
                        className={
                          conversationCategory === "GROUPS" ? "active" : ""
                        }
                        onClick={() => {
                          navigate("/messages");
                          setConversationCategory("GROUPS");
                          setConversationListView("ACTIVE");
                        }}
                      >
                        {t("filters.personal")}
                      </button>
                      <button
                        type="button"
                        className={
                          conversationCategory === "OFFICIAL" ? "active" : ""
                        }
                        onClick={() => {
                          navigate("/messages");
                          setConversationCategory("OFFICIAL");
                          setConversationListView("ACTIVE");
                        }}
                      >
                        {t("filters.official")}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={
                          !listMode &&
                          conversationCategory === "ALL" &&
                          conversationListView === "ACTIVE"
                            ? "active"
                            : ""
                        }
                        onClick={() => {
                          navigate("/messages");
                          setConversationCategory("ALL");
                          setConversationListView("ACTIVE");
                        }}
                      >
                        {t("filters.all")}
                      </button>
                      <button
                        type="button"
                        className={
                          !listMode &&
                          conversationCategory === "UNREAD" &&
                          conversationListView === "ACTIVE"
                            ? "active"
                            : ""
                        }
                        onClick={() => {
                          navigate("/messages");
                          setConversationCategory("UNREAD");
                          setConversationListView("ACTIVE");
                        }}
                      >
                        {t("filters.unread")}
                        {totalUnread > 0 ? ` ${totalUnread}` : ""}
                      </button>
                      <button
                        type="button"
                        className={
                          !listMode && conversationListView === "FAVORITES"
                            ? "active"
                            : ""
                        }
                        onClick={() => {
                          navigate("/messages");
                          setConversationCategory("ALL");
                          setConversationListView("FAVORITES");
                        }}
                      >
                        {t("filters.favorites")}
                      </button>

                      <span
                        className="message-filter-divider"
                        aria-hidden="true"
                      />
                      <span className="message-list-filter-label">
                        {t("filters.myLists")}
                      </span>

                      {chatFoldersLoading ? (
                        <span className="message-filter-loading" role="status">
                          <span
                            className="message-small-spinner"
                            aria-hidden="true"
                          />
                          <span className="sr-only">{t("loading.lists")}</span>
                        </span>
                      ) : chatFoldersError ? (
                        <button
                          type="button"
                          className="message-filter-retry"
                          onClick={() => void loadChatFolders()}
                          title={chatFoldersError}
                        >
                          {t("filters.retryLists")}
                        </button>
                      ) : (
                        chatFolders.map((folder) => {
                          const conversationCount = folder.items.filter(
                            (item) => item.conversationId,
                          ).length;

                          return (
                            <button
                              key={folder.id}
                              type="button"
                              className={
                                selectedListId === folder.id ? "active" : ""
                              }
                              onClick={() => openChatFolder(folder.id)}
                              aria-current={
                                selectedListId === folder.id
                                  ? "page"
                                  : undefined
                              }
                              title={t("filters.listCountTitle", {
                                name: folder.name,
                                total: conversationCount,
                              })}
                            >
                              {folder.name}
                            </button>
                          );
                        })
                      )}

                      <button
                        type="button"
                        className="message-filter-create-list"
                        onClick={openCreateList}
                        aria-label={t("filters.createListAria")}
                        title={t("filters.createList")}
                      >
                        <span aria-hidden="true">＋</span>
                      </button>
                    </>
                  )}
                </div>
              ) : null}

              <div className="message-sidebar-summary">
                {settingsMode ? (
                  <>
                    <span>
                      {t("summary.sections", { total: SETTINGS_TABS.length })}
                    </span>
                    <span>{t("summary.accountPreferences")}</span>
                  </>
                ) : notificationMode ? (
                  <>
                    <span>
                      {t("summary.notifications", {
                        total: filteredNotifications.length,
                      })}
                    </span>
                    <span>
                      {t("summary.unread", { total: notificationUnreadCount })}
                    </span>
                  </>
                ) : announcementMode ? (
                  <>
                    <span>
                      {t("summary.officialGroups", {
                        total: announcementGroupSearchResults.length,
                      })}
                    </span>
                    <span>{t("summary.announcements")}</span>
                  </>
                ) : starredMode ? (
                  <>
                    <span>
                      {starredHasMore
                        ? t("summary.loaded", {
                            total: filteredStarredItems.length,
                          })
                        : t("summary.starred", {
                            total: filteredStarredItems.length,
                          })}
                    </span>
                    <span>
                      {conversationSearch.trim()
                        ? t("summary.search")
                        : starredHasMore
                          ? t("summary.moreAvailable")
                          : t("summary.personal")}
                    </span>
                  </>
                ) : archivedMode ? (
                  <>
                    <span>
                      {conversationHasMore
                        ? t("summary.loaded", {
                            total: filteredConversations.length,
                          })
                        : t("summary.archived", {
                            total: filteredConversations.length,
                          })}
                    </span>
                    <span>
                      {conversationSearch.trim()
                        ? t("summary.search")
                        : conversationHasMore
                          ? t("summary.moreAvailable")
                          : t("summary.conversationsLabel")}
                    </span>
                  </>
                ) : requestMode ? (
                  <>
                    <span>
                      {t("summary.requests", {
                        total: filteredRequestItems.length,
                      })}
                    </span>
                    <span>
                      {requestListView === "RECEIVED"
                        ? t("filters.received")
                        : t("filters.sent")}
                    </span>
                  </>
                ) : listCreateMode ? (
                  <>
                    <span>
                      {t("summary.selected", {
                        total: listSelectedConversationIds.length,
                      })}
                    </span>
                    <span>{t("summary.createList")}</span>
                  </>
                ) : listMode ? (
                  <>
                    <span>
                      {conversationHasMore
                        ? t("summary.loaded", {
                            total: filteredConversations.length,
                          })
                        : t("summary.conversations", {
                            total: filteredConversations.length,
                          })}
                    </span>
                    <span>
                      {conversationHasMore
                        ? t("summary.moreAvailable")
                        : t("summary.unread", { total: totalUnread })}
                    </span>
                  </>
                ) : conversationSearch.trim() ? (
                  <>
                    <span>
                      {t("summary.results", {
                        total: conversationSearchResultCount,
                      })}
                    </span>
                    <span>{t("summary.search")}</span>
                  </>
                ) : (
                  <>
                    <span>
                      {conversationHasMore
                        ? t("summary.loaded", {
                            total: filteredConversations.length,
                          })
                        : t("summary.conversations", {
                            total: filteredConversations.length,
                          })}
                    </span>
                    <span>
                      {conversationHasMore
                        ? t("summary.moreAvailable")
                        : t("summary.unread", { total: totalUnread })}
                    </span>
                  </>
                )}
              </div>

              {notificationMode && (
                <div className="message-notification-sidebar-actions">
                  <button
                    type="button"
                    onClick={() => void handleMarkAllNotificationsRead()}
                    disabled={
                      notificationUnreadCount === 0 ||
                      notificationBulkAction !== null ||
                      notificationDeletingId !== null
                    }
                  >
                    {notificationBulkAction === "MARK_ALL_READ"
                      ? t("actions.marking")
                      : t("actions.markAllRead")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteReadNotifications()}
                    disabled={
                      notificationBulkAction !== null ||
                      notificationDeletingId !== null ||
                      !notifications.some((notification) => notification.isRead)
                    }
                  >
                    {notificationBulkAction === "DELETE_READ"
                      ? t("actions.removing")
                      : t("actions.removeSeen")}
                  </button>
                  <button
                    type="button"
                    onClick={() => openSettingsWorkspace("NOTIFICATIONS")}
                  >
                    {t("actions.settings")}
                  </button>
                </div>
              )}

              {requestNotice && (
                <div
                  className="message-inline-notice"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <span>{requestNotice}</span>
                  <button
                    type="button"
                    onClick={() => setRequestNotice(null)}
                    aria-label={t("actions.dismissRequestNotice")}
                  >
                    ×
                  </button>
                </div>
              )}

              {!starredMode &&
                !requestMode &&
                !notificationMode &&
                !settingsMode &&
                !ownProfileMode &&
                !newConversationMode &&
                !createGroupMode &&
                pageError && (
                  <div className="message-inline-error" role="alert">
                    <p>{pageError}</p>
                    <button
                      type="button"
                      onClick={() => void loadConversations()}
                    >
                      {t("actions.retry")}
                    </button>
                  </div>
                )}

              <div
                ref={conversationListRef}
                className={`message-conversation-list${
                  (newConversationMode
                    ? contactSearch
                    : conversationSearch
                  ).trim()
                    ? " search-results"
                    : ""
                }${newConversationMode ? " contact-workspace-list" : ""}`}
                aria-busy={
                  settingsMode || ownProfileMode || createGroupMode
                    ? false
                    : newConversationMode
                      ? contactsLoading
                      : notificationMode
                        ? notificationsLoading
                        : announcementMode
                          ? conversationLoading
                          : starredMode
                            ? starredLoading
                            : requestMode
                              ? requestsLoading
                              : conversationLoading
                }
                onKeyDown={
                  newConversationMode
                    ? undefined
                    : handleConversationListKeyDown
                }
              >
                {(
                  settingsMode || ownProfileMode || createGroupMode
                    ? false
                    : newConversationMode
                      ? contactsLoading
                      : notificationMode
                        ? notificationsLoading
                        : announcementMode
                          ? conversationLoading
                          : starredMode
                            ? starredLoading
                            : requestMode
                              ? requestsLoading
                              : conversationLoading
                ) ? (
                  <div
                    className="message-list-state"
                    role="status"
                    aria-live="polite"
                  >
                    <span
                      className="message-small-spinner"
                      aria-hidden="true"
                    />
                    <p>
                      {newConversationMode
                        ? t("loading.eligibleAccounts")
                        : notificationMode
                          ? t("loading.notifications")
                          : announcementMode
                            ? t("loading.officialGroups")
                            : starredMode
                              ? t("loading.starredMessages")
                              : requestMode
                                ? t("loading.messageRequests")
                                : t("loading.conversations")}
                    </p>
                  </div>
                ) : settingsMode ? (
                  <div className="message-settings-sidebar-note">
                    <span aria-hidden="true">⚙</span>
                    <strong>
                      {t(
                        SETTINGS_TABS.find((tab) => tab.value === settingsTab)
                          ?.labelKey ?? "messageSettings.tabs.privacy",
                      )}
                    </strong>
                    <p>{t("settingsSidebar.description")}</p>
                  </div>
                ) : ownProfileMode ? (
                  <div className="message-profile-sidebar-note">
                    <strong>{t("profileSidebar.title")}</strong>
                    <p>{t("profileSidebar.description")}</p>
                  </div>
                ) : createGroupMode ? (
                  <div className="message-create-flow-sidebar-note">
                    <strong>
                      {groupKind === "OFFICIAL"
                        ? t("groupCreate.officialMembership")
                        : t("groupCreate.personalMembership")}
                    </strong>
                    <p>
                      {groupKind === "OFFICIAL"
                        ? t("groupCreate.officialMembershipDescription")
                        : groupSelectedAccountIds.length === 0
                          ? t("groupCreate.chooseMemberDescription")
                          : t("groupCreate.selectedMembers", {
                              total: groupSelectedAccountIds.length,
                            })}
                    </p>
                  </div>
                ) : newConversationMode ? (
                  contactError ? (
                    <div
                      className="message-list-state compact danger"
                      role="alert"
                    >
                      <div className="message-empty-icon" aria-hidden="true">
                        !
                      </div>
                      <h2>{t("newConversation.peopleUnavailable")}</h2>
                      <p>{contactError}</p>
                    </div>
                  ) : contacts.length === 0 ? (
                    <div className="message-list-state compact" role="status">
                      <div className="message-empty-icon" aria-hidden="true">
                        +
                      </div>
                      <h2>{t("newConversation.none")}</h2>
                      <p>{t("newConversation.emptyHint")}</p>
                    </div>
                  ) : (
                    contacts.map((contact) => (
                      <article
                        key={contact.accountId}
                        className="message-contact-workspace-row"
                      >
                        <div className="message-contact-workspace-open">
                          {renderAccountAvatar(contact)}
                          <span>
                            <strong>{contact.displayName}</strong>
                            <small>
                              {contact.employee?.designation ??
                                roleLabel(contact.role, t)}
                            </small>
                            <em>
                              {employeeOrgContextLabel(
                                contact.employee,
                                contact.username ?? roleLabel(contact.role, t),
                              )}
                            </em>
                          </span>
                        </div>
                        <button
                          type="button"
                          className="message-contact-workspace-action"
                          onClick={() => void handleCreateConversation(contact)}
                          disabled={
                            creatingConversationId !== null ||
                            contact.contactMode === "REQUEST_SENT" ||
                            contact.contactMode === "BLOCKED"
                          }
                        >
                          {creatingConversationId === contact.accountId
                            ? t("actions.opening")
                            : contactActionLabel(contact, t)}
                        </button>
                      </article>
                    ))
                  )
                ) : notificationMode ? (
                  notificationError ? (
                    <div
                      className="message-list-state compact danger"
                      role="alert"
                    >
                      <div className="message-empty-icon" aria-hidden="true">
                        !
                      </div>
                      <h2>{t("notification.unavailable")}</h2>
                      <p>{notificationError}</p>
                    </div>
                  ) : filteredNotifications.length === 0 ? (
                    <div className="message-list-state compact" role="status">
                      <div className="message-empty-icon" aria-hidden="true">
                        N
                      </div>
                      <h2>
                        {conversationSearch.trim()
                          ? t("notification.noMatching")
                          : notificationListView === "UNREAD"
                            ? t("notification.noUnread")
                            : t("notification.noneYet")}
                      </h2>
                      <p>
                        {conversationSearch.trim()
                          ? t("notification.searchHint")
                          : t("notification.emptyHint")}
                      </p>
                    </div>
                  ) : (
                    <div className="message-notification-workspace-list">
                      {filteredNotifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`message-notification-row${notification.isRead ? "" : " unread"}`}
                        >
                          <button
                            type="button"
                            className="message-notification-open"
                            onClick={() =>
                              void handleNotificationClick(notification)
                            }
                          >
                            <span>
                              <strong>{notification.title}</strong>
                              <small>
                                {messagingSettings.notificationPreview
                                  ? notification.body
                                  : t("notification.previewHidden")}
                              </small>
                            </span>
                            <em>
                              {notificationTimestampLabel(
                                notification.createdAt,
                              )}
                            </em>
                          </button>
                          <button
                            type="button"
                            className="message-notification-delete"
                            aria-label={t("actions.removeNotificationAria", {
                              title: notification.title,
                            })}
                            onClick={() =>
                              void handleDeleteNotification(notification)
                            }
                            disabled={
                              notificationBulkAction !== null ||
                              notificationDeletingId !== null
                            }
                            aria-busy={
                              notificationDeletingId === notification.id
                            }
                          >
                            {notificationDeletingId === notification.id
                              ? "…"
                              : "×"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                ) : announcementMode ? (
                  announcementGroupSearchResults.length === 0 ? (
                    <div className="message-list-state compact" role="status">
                      <div className="message-empty-icon" aria-hidden="true">
                        A
                      </div>
                      <h2>{t("announcements.noGroups")}</h2>
                      <p>{t("announcements.noGroupsHint")}</p>
                    </div>
                  ) : (
                    announcementGroupSearchResults.map(
                      renderAnnouncementGroupRow,
                    )
                  )
                ) : starredMode ? (
                  starredError ? (
                    <div
                      className="message-list-state compact danger"
                      role="alert"
                    >
                      <div className="message-empty-icon" aria-hidden="true">
                        !
                      </div>
                      <h2>{t("starred.unavailable")}</h2>
                      <p>{starredError}</p>
                      <button
                        type="button"
                        onClick={() => void loadStarredMessages()}
                      >
                        {t("actions.tryAgain")}
                      </button>
                    </div>
                  ) : filteredStarredItems.length === 0 ? (
                    <>
                      <div className="message-list-state compact" role="status">
                        <div className="message-empty-icon" aria-hidden="true">
                          ★
                        </div>
                        <h2>
                          {conversationSearch.trim()
                            ? t("starred.noMatchingLoaded")
                            : t("starred.noneYet")}
                        </h2>
                        <p>
                          {conversationSearch.trim()
                            ? starredHasMore
                              ? t("starred.loadMoreOrSearch")
                              : t("starred.searchHint")
                            : t("starred.emptyHint")}
                        </p>
                      </div>
                      {starredHasMore ? (
                        <button
                          type="button"
                          className="message-conversation-load-more"
                          onClick={() => void loadMoreStarredMessages()}
                          disabled={starredLoadingMore}
                        >
                          {starredLoadingMore
                            ? t("starred.loadingOlder")
                            : t("starred.loadMore")}
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div className="message-starred-workspace-list">
                        {filteredStarredItems.map(renderStarredMessageRow)}
                      </div>
                      {starredHasMore ? (
                        <button
                          type="button"
                          className="message-conversation-load-more"
                          onClick={() => void loadMoreStarredMessages()}
                          disabled={starredLoadingMore}
                        >
                          {starredLoadingMore
                            ? t("starred.loadingOlder")
                            : t("starred.loadMore")}
                        </button>
                      ) : null}
                    </>
                  )
                ) : requestMode ? (
                  requestError ? (
                    <div
                      className="message-list-state compact danger"
                      role="alert"
                    >
                      <div className="message-empty-icon" aria-hidden="true">
                        !
                      </div>
                      <h2>{t("requests.unavailable")}</h2>
                      <p>{requestError}</p>
                      <button
                        type="button"
                        onClick={() => void loadMessageRequests()}
                      >
                        {t("actions.tryAgain")}
                      </button>
                    </div>
                  ) : filteredRequestItems.length === 0 ? (
                    <div className="message-list-state compact" role="status">
                      <div className="message-empty-icon" aria-hidden="true">
                        {requestListView === "RECEIVED" ? "↓" : "↑"}
                      </div>
                      <h2>
                        {conversationSearch.trim()
                          ? t("requests.noMatching")
                          : requestListView === "RECEIVED"
                            ? t("requests.noReceived")
                            : t("requests.noSent")}
                      </h2>
                      <p>
                        {conversationSearch.trim()
                          ? t("requests.searchHint")
                          : requestListView === "RECEIVED"
                            ? t("requests.receivedHint")
                            : t("requests.sentHint")}
                      </p>
                    </div>
                  ) : (
                    filteredRequestItems.map(renderMessageRequestRow)
                  )
                ) : conversationSearch.trim() ? (
                  conversationSearchResultCount === 0 ? (
                    <div className="message-list-state compact" role="status">
                      <div className="message-empty-icon" aria-hidden="true">
                        ⌕
                      </div>
                      <h2>{t("conversationSearch.none")}</h2>
                      <p>{t("conversationSearch.hint")}</p>
                    </div>
                  ) : (
                    <div className="message-conversation-search-results">
                      {conversationSearchResults.directChats.length > 0 && (
                        <section className="message-search-result-section">
                          <h2>{t("conversationSearch.chats")}</h2>
                          <div className="message-search-result-list">
                            {conversationSearchResults.directChats.map(
                              renderConversationRow,
                            )}
                          </div>
                        </section>
                      )}

                      {conversationSearchResults.groupsInCommon.length > 0 && (
                        <section className="message-search-result-section">
                          <h2>{t("conversationSearch.groupsInCommon")}</h2>
                          <div className="message-search-result-list">
                            {conversationSearchResults.groupsInCommon.map(
                              renderGroupSearchResult,
                            )}
                          </div>
                        </section>
                      )}
                    </div>
                  )
                ) : filteredConversations.length === 0 ? (
                  <div className="message-list-state" role="status">
                    <div className="message-empty-icon" aria-hidden="true">
                      {listMode ? "L" : "M"}
                    </div>
                    <h2>
                      {listMode
                        ? t("conversationList.noneInList")
                        : archivedMode
                          ? t("conversationList.noneArchived")
                          : t("conversationList.noneFound")}
                    </h2>
                    <p>
                      {listMode
                        ? t("conversationList.listHint")
                        : archivedMode
                          ? t("conversationList.archivedHint")
                          : t("conversationList.emptyHint")}
                    </p>
                    {conversationHasMore
                      ? renderConversationLoadMoreControl()
                      : !archivedMode && (
                          <button
                            type="button"
                            onClick={
                              listMode
                                ? openSelectedListManager
                                : openNewConversation
                            }
                          >
                            {listMode
                              ? t("conversationList.manageList")
                              : t("conversationList.newConversation")}
                          </button>
                        )}
                  </div>
                ) : (
                  <>
                    {filteredConversations.map(renderConversationRow)}
                    {renderConversationLoadMoreControl()}
                  </>
                )}
              </div>
            </aside>
          )}

        <section className="message-chat-panel">
          {realtimeStatus !== "CONNECTED" && (
            <div
              className={`message-realtime-state ${realtimeStatus.toLowerCase()}`}
            >
              <span
                className="message-realtime-state-indicator"
                aria-hidden="true"
              />
              <div>
                <strong>
                  {realtimeStatus === "RECONNECTING"
                    ? t("realtime.reconnecting")
                    : realtimeStatus === "CONNECTING"
                      ? t("realtime.connecting")
                      : t("realtime.offline")}
                </strong>
                <small>
                  {realtimeStatus === "DISCONNECTED"
                    ? t("realtime.disconnectedHint")
                    : t("realtime.restoringHint")}
                </small>
              </div>
            </div>
          )}

          {storageUsageScope ? (
            renderStorageUsageWorkspaceContent()
          ) : ownProfileMode ? (
            <div className="message-profile-workspace">
              <header className="message-profile-workspace-header">
                <button
                  type="button"
                  className="message-mobile-back"
                  onClick={() => navigate("/messages")}
                  aria-label={t("thread.header.backToConversations")}
                >
                  ←
                </button>
                <div>
                  <span>{t("profile.myProfile")}</span>
                  <h2>{t("profileWorkspace.title")}</h2>
                  <p>{t("profileWorkspace.description")}</p>
                </div>
                <button
                  type="button"
                  className="message-workspace-close-action"
                  onClick={() => navigate("/messages")}
                >
                  {t("navigation.backToChats")}
                </button>
              </header>
              <div className="message-profile-workspace-scroll">
                {renderProfileContent()}
              </div>
            </div>
          ) : createGroupMode ? (
            renderCreateGroupWorkspaceContent()
          ) : (listCreateMode ||
              (listMode && (!selectedChatFolder || listEditMode))) &&
            !selectedConversation ? (
            renderMessageListWorkspaceContent()
          ) : groupManagementWorkspaceOpen &&
            selectedConversation?.type === "GROUP" ? (
            renderGroupManagementWorkspaceContent()
          ) : privateGroupDialogOpen &&
            selectedConversation?.type === "PRIVATE" ? (
            renderPrivateGroupWorkspaceContent()
          ) : newConversationMode ? (
            <div className="message-new-conversation-workspace">
              <div className="message-collection-welcome-state">
                <span
                  className="message-collection-welcome-icon"
                  aria-hidden="true"
                >
                  <MessageNavigationIcon name="newChat" />
                </span>
                <h2>{t("newConversationWorkspace.title")}</h2>
                <p>{t("newConversationWorkspace.description")}</p>
                <small>{t("newConversationWorkspace.rulesNote")}</small>
              </div>
            </div>
          ) : settingsMode ? (
            <div className="message-settings-workspace">
              <header className="message-settings-workspace-header">
                <button
                  type="button"
                  className="message-mobile-back"
                  onClick={() => navigate("/messages")}
                  aria-label={t("messageSettings.backToMessages")}
                >
                  ←
                </button>
                <div>
                  <span>{t("messageSettings.eyebrow")}</span>
                  <h2 className="message-settings-desktop-title">
                    {t("messageSettings.title")}
                  </h2>
                  <h2 className="message-settings-mobile-title">
                    {t("messageSettings.mobileTitle")}
                  </h2>
                  <p>{t("messageSettings.description")}</p>
                </div>
                <button
                  type="button"
                  className="message-workspace-close-action"
                  onClick={() => navigate("/messages")}
                >
                  {t("navigation.backToChats")}
                </button>
              </header>

              <div className="message-settings-workspace-layout">
                <div
                  className="message-settings-workspace-mobile-tabs"
                  role="tablist"
                  aria-label={t("messageSettings.sectionsAria")}
                >
                  {SETTINGS_TABS.map((tab) => (
                    <button
                      key={tab.value}
                      id={`message-settings-mobile-tab-${tab.value.toLowerCase()}`}
                      type="button"
                      role="tab"
                      className={settingsTab === tab.value ? "active" : ""}
                      aria-selected={settingsTab === tab.value}
                      aria-controls="message-settings-tabpanel"
                      onClick={(event) => {
                        setSettingsTab(tab.value);
                        // Keep the selected chip in view on narrow screens without moving the page vertically.
                        event.currentTarget.scrollIntoView({
                          behavior: "smooth",
                          block: "nearest",
                          inline: "center",
                        });
                      }}
                    >
                      {t(tab.labelKey)}
                    </button>
                  ))}
                </div>

                <div
                  id="message-settings-tabpanel"
                  className="message-settings-body"
                  role="tabpanel"
                  aria-labelledby={`message-settings-mobile-tab-${settingsTab.toLowerCase()}`}
                  tabIndex={0}
                >
                  {settingsTab === "PRIVACY" && (
                    <section className="message-settings-section">
                      {messagingSettingsLoading && (
                        <p className="message-settings-note">
                          {t("messageSettings.privacy.loading")}
                        </p>
                      )}

                      <label className="message-settings-toggle">
                        <span>
                          <strong>
                            {t("messageSettings.privacy.onlineStatus")}
                          </strong>
                          <small>
                            {t(
                              "messageSettings.privacy.onlineStatusDescription",
                            )}
                          </small>
                        </span>
                        <input
                          type="checkbox"
                          checked={messagingSettings.showOnlineStatus}
                          onChange={(event) =>
                            updateMessagingSettings({
                              showOnlineStatus: event.target.checked,
                            })
                          }
                          disabled={
                            messagingSettingsLoading || messagingSettingsSaving
                          }
                        />
                      </label>

                      <label className="message-settings-toggle">
                        <span>
                          <strong>
                            {t("messageSettings.privacy.readReceipts")}
                          </strong>
                          <small>
                            {t(
                              "messageSettings.privacy.readReceiptsDescription",
                            )}
                          </small>
                        </span>
                        <input
                          type="checkbox"
                          checked={messagingSettings.showReadReceipts}
                          onChange={(event) =>
                            updateMessagingSettings({
                              showReadReceipts: event.target.checked,
                            })
                          }
                          disabled={
                            messagingSettingsLoading || messagingSettingsSaving
                          }
                        />
                      </label>

                      <label className="message-settings-toggle">
                        <span>
                          <strong>
                            {t("messageSettings.privacy.messageRequests")}
                          </strong>
                          <small>
                            {t(
                              "messageSettings.privacy.messageRequestsDescription",
                            )}
                          </small>
                        </span>
                        <input
                          type="checkbox"
                          checked={messagingSettings.requireMessageRequests}
                          onChange={(event) =>
                            updateMessagingSettings({
                              requireMessageRequests: event.target.checked,
                            })
                          }
                          disabled={
                            messagingSettingsLoading || messagingSettingsSaving
                          }
                        />
                      </label>

                      {messagingSettingsSaving && (
                        <p className="message-settings-note" role="status">
                          {t("messageSettings.privacy.saving")}
                        </p>
                      )}

                      {messagingSettingsNotice && (
                        <p className="message-settings-success" role="status">
                          {messagingSettingsNotice}
                        </p>
                      )}

                      {messagingSettingsError && (
                        <p
                          className="message-settings-danger-note"
                          role="alert"
                        >
                          {messagingSettingsError}
                        </p>
                      )}

                      <div className="message-settings-actions">
                        <button
                          type="button"
                          onClick={resetPrivacySettings}
                          disabled={
                            messagingSettingsLoading || messagingSettingsSaving
                          }
                        >
                          {t("messageSettings.privacy.restoreDefaults")}
                        </button>
                      </div>

                      <p className="message-settings-note">
                        {t("messageSettings.privacy.accountScope")}
                      </p>
                    </section>
                  )}

                  {settingsTab === "NOTIFICATIONS" && (
                    <section className="message-settings-section">
                      <label className="message-settings-toggle">
                        <span>
                          <strong>
                            {t("messageSettings.notifications.sound")}
                          </strong>
                          <small>
                            {t(
                              "messageSettings.notifications.soundDescription",
                            )}
                          </small>
                        </span>
                        <input
                          type="checkbox"
                          checked={notificationSoundEnabled}
                          onChange={(event) =>
                            setNotificationSoundEnabled(event.target.checked)
                          }
                          disabled={messagingSettings.muteAllNotifications}
                        />
                      </label>

                      <label className="message-settings-toggle">
                        <span>
                          <strong>
                            {t("messageSettings.notifications.browser")}
                          </strong>
                          <small>
                            {t(
                              "messageSettings.notifications.browserDescription",
                            )}
                          </small>
                        </span>
                        <input
                          type="checkbox"
                          checked={browserNotificationsEnabled}
                          onChange={() =>
                            void handleBrowserNotificationToggle()
                          }
                          disabled={messagingSettings.muteAllNotifications}
                        />
                      </label>

                      <p className="message-settings-note">
                        {t("messageSettings.notifications.browserPermission")}{" "}
                        <strong>{browserNotificationPermissionLabel(t)}</strong>
                        .
                        {browserNotificationsEnabled && (
                          <>
                            {" "}
                            {t(
                              "messageSettings.notifications.backgroundDelivery",
                            )}{" "}
                            <strong>
                              {backgroundPushReady
                                ? t("messageSettings.notifications.ready")
                                : t("messageSettings.notifications.connecting")}
                            </strong>
                            .
                          </>
                        )}
                        {t(
                          "messageSettings.notifications.browserPermissionNote",
                        )}
                      </p>

                      <label className="message-settings-toggle">
                        <span>
                          <strong>
                            {t("messageSettings.notifications.preview")}
                          </strong>
                          <small>
                            {t(
                              "messageSettings.notifications.previewDescription",
                            )}
                          </small>
                        </span>
                        <input
                          type="checkbox"
                          checked={messagingSettings.notificationPreview}
                          onChange={(event) =>
                            updateMessagingSettings({
                              notificationPreview: event.target.checked,
                            })
                          }
                        />
                      </label>

                      <label className="message-settings-toggle">
                        <span>
                          <strong>
                            {t("messageSettings.notifications.mutePopups")}
                          </strong>
                          <small>
                            {t(
                              "messageSettings.notifications.mutePopupsDescription",
                            )}
                          </small>
                        </span>
                        <input
                          type="checkbox"
                          checked={messagingSettings.muteAllNotifications}
                          onChange={(event) =>
                            updateMessagingSettings({
                              muteAllNotifications: event.target.checked,
                            })
                          }
                        />
                      </label>

                      {messagingSettingsNotice && (
                        <p className="message-settings-success" role="status">
                          {messagingSettingsNotice}
                        </p>
                      )}

                      {messagingSettingsError && (
                        <p
                          className="message-settings-danger-note"
                          role="alert"
                        >
                          {messagingSettingsError}
                        </p>
                      )}

                      <div className="message-settings-actions">
                        <button
                          type="button"
                          onClick={resetNotificationSettings}
                        >
                          {t("messageSettings.notifications.restoreDefaults")}
                        </button>
                      </div>

                      <p className="message-settings-note">
                        {t("messageSettings.notifications.deviceScopeNote")}
                      </p>
                    </section>
                  )}

                  {settingsTab === "APPEARANCE" && (
                    <section className="message-settings-section">
                      <label className="message-customization-field">
                        <span>{t("messageSettings.appearance.theme")}</span>
                        <select
                          value={messagingCustomization.theme}
                          onChange={(event) =>
                            updateMessagingCustomization({
                              theme: event.target.value as MessagingTheme,
                            })
                          }
                        >
                          {THEME_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {t(
                                `messageSettings.appearance.themeOptions.${option.value.toLowerCase()}`,
                              )}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="message-customization-field">
                        <span>{t("messageSettings.appearance.wallpaper")}</span>
                        <select
                          value={messagingCustomization.wallpaper}
                          onChange={(event) =>
                            updateMessagingCustomization({
                              wallpaper: event.target
                                .value as MessagingWallpaper,
                            })
                          }
                        >
                          {WALLPAPER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {t(
                                `messageSettings.appearance.wallpaperOptions.${option.value.toLowerCase()}`,
                              )}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="message-customization-field">
                        <span>{t("messageSettings.appearance.density")}</span>
                        <select
                          value={messagingCustomization.density}
                          onChange={(event) =>
                            updateMessagingCustomization({
                              density: event.target.value as MessagingDensity,
                            })
                          }
                        >
                          {DENSITY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {t(
                                `messageSettings.appearance.densityOptions.${option.value.toLowerCase()}`,
                              )}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="message-settings-toggle">
                        <span>
                          <strong>
                            {t("messageSettings.appearance.reduceMotion")}
                          </strong>
                          <small>
                            {t(
                              "messageSettings.appearance.reduceMotionDescription",
                            )}
                          </small>
                        </span>
                        <input
                          type="checkbox"
                          checked={messagingCustomization.reduceMotion}
                          onChange={(event) =>
                            updateMessagingCustomization({
                              reduceMotion: event.target.checked,
                            })
                          }
                        />
                      </label>

                      <div className="message-settings-actions">
                        <button
                          type="button"
                          onClick={resetMessagingCustomization}
                        >
                          {t("messageSettings.appearance.restoreDefaults")}
                        </button>
                      </div>

                      <p className="message-settings-note">
                        {t("messageSettings.appearance.scopeNote")}
                      </p>
                    </section>
                  )}

                  {settingsTab === "STORAGE" && (
                    <section className="message-settings-section message-settings-storage-section">
                      <button
                        type="button"
                        className="message-settings-storage-open"
                        onClick={() => openStorageUsage({ kind: "USER" })}
                      >
                        <MessageNavigationIcon name="storage" />
                        <span>
                          <strong>{t("messageSettings.storage.manage")}</strong>
                          <small>
                            {t("messageSettings.storage.description")}
                          </small>
                        </span>
                      </button>

                      <p className="message-settings-note">
                        {t("messageSettings.storage.accessNote")}
                      </p>
                    </section>
                  )}

                  {settingsTab === "BLOCKED" && (
                    <section className="message-settings-section">
                      <div className="message-settings-summary">
                        <strong>{blockedAccounts.length}</strong>
                        <span>
                          {t("messageSettings.blocked.count", {
                            count: blockedAccounts.length,
                          })}
                        </span>
                      </div>

                      {blockSettingsNotice && (
                        <p className="message-settings-success">
                          {blockSettingsNotice}
                        </p>
                      )}

                      {blockSettingsError && (
                        <p className="message-settings-danger-note">
                          {blockSettingsError}
                        </p>
                      )}

                      {blockedAccountsLoading ? (
                        <p className="message-settings-empty">
                          {t("messageSettings.blocked.loading")}
                        </p>
                      ) : blockedAccounts.length === 0 ? (
                        <p className="message-settings-empty">
                          {t("messageSettings.blocked.none")}
                        </p>
                      ) : (
                        <div className="message-settings-blocked-list">
                          {blockedAccounts.map((block) => (
                            <article key={block.blockedAccountId}>
                              {renderAccountAvatar(
                                block.account,
                                "message-avatar small",
                              )}
                              <div>
                                <strong>{block.account.displayName}</strong>
                                <small>
                                  {t("messageSettings.blocked.description")}
                                </small>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleUnblockAccount(
                                    block.blockedAccountId,
                                  )
                                }
                                disabled={blockActionAccountId !== null}
                              >
                                {blockActionAccountId === block.blockedAccountId
                                  ? t("messageSettings.blocked.working")
                                  : t("messageSettings.blocked.unblock")}
                              </button>
                            </article>
                          ))}
                        </div>
                      )}

                      {blockedMessageRequests.length > 0 && (
                        <p className="message-settings-note">
                          {t("messageSettings.blocked.oldRequests", {
                            count: blockedMessageRequests.length,
                          })}
                        </p>
                      )}

                      <p className="message-settings-note">
                        {t("messageSettings.blocked.scopeNote")}
                      </p>
                    </section>
                  )}

                  {settingsTab === "SECURITY" && (
                    <section className="message-settings-section">
                      <div className="message-settings-security-card">
                        <span>
                          {t("messageSettings.security.signedInAccount")}
                        </span>
                        <strong>
                          {account?.displayName ?? t("profile.userFallback")}
                        </strong>
                        <small>
                          {account?.positionLabel ??
                            (account
                              ? roleLabel(account.role, t)
                              : t("profile.employee"))}{" "}
                          · {realtimeLabel}
                        </small>
                      </div>

                      {securityNotice && (
                        <p className="message-settings-success" role="status">
                          {securityNotice}
                        </p>
                      )}

                      {securityError && (
                        <p
                          className="message-settings-danger-note"
                          role="alert"
                        >
                          {securityError}
                        </p>
                      )}

                      <div className="message-settings-actions">
                        <button
                          type="button"
                          onClick={() => {
                            navigate("/settings/security");
                          }}
                        >
                          {t("messageSettings.security.changePassword")}
                        </button>
                        <button
                          type="button"
                          onClick={handleLogout}
                          disabled={loggingOut || securityAction !== null}
                        >
                          {loggingOut
                            ? t("messageSettings.security.signingOut")
                            : t("messageSettings.security.signOutDevice")}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void handleLogoutAllDevices()}
                          disabled={loggingOut || securityAction !== null}
                        >
                          {securityAction === "SIGN_OUT_ALL"
                            ? t("messageSettings.security.signingOutAll")
                            : t("messageSettings.security.signOutAll")}
                        </button>
                      </div>

                      <p className="message-settings-note">
                        {t("messageSettings.security.scopeNote")}
                      </p>
                    </section>
                  )}
                </div>
              </div>
            </div>
          ) : notificationMode ? (
            <div className="message-notification-workspace">
              <header className="message-notification-workspace-header">
                <button
                  type="button"
                  className="message-mobile-back"
                  onClick={() => navigate("/messages")}
                  aria-label={t("messageSettings.backToMessages")}
                >
                  ←
                </button>
                <div>
                  <span>{t("notificationWorkspace.eyebrow")}</span>
                  <h2>{t("notificationWorkspace.title")}</h2>
                  <p>{t("notificationWorkspace.description")}</p>
                </div>
                <button
                  type="button"
                  className="message-workspace-close-action"
                  onClick={() => navigate("/messages")}
                >
                  {t("navigation.backToChats")}
                </button>
              </header>

              <div className="message-notification-workspace-body">
                <aside className="message-notification-workspace-list-panel">
                  <div className="message-notification-workspace-list-header">
                    <div className="message-notification-workspace-metrics">
                      <article>
                        <span>{t("notificationWorkspace.all")}</span>
                        <strong>{notifications.length}</strong>
                      </article>
                      <article>
                        <span>{t("notificationWorkspace.unread")}</span>
                        <strong>{notificationUnreadCount}</strong>
                      </article>
                    </div>

                    <div
                      className="message-notification-workspace-filters"
                      aria-label={t("filters.notificationFiltersAria")}
                    >
                      <button
                        type="button"
                        className={
                          notificationListView === "ALL" ? "active" : ""
                        }
                        onClick={() => setNotificationListView("ALL")}
                      >
                        {t("thread.pinned.all")}
                      </button>
                      <button
                        type="button"
                        className={
                          notificationListView === "UNREAD" ? "active" : ""
                        }
                        onClick={() => setNotificationListView("UNREAD")}
                      >
                        {t("notificationWorkspace.unread")}{" "}
                        {notificationUnreadCount > 0
                          ? notificationUnreadCount
                          : ""}
                      </button>
                    </div>

                    <label className="message-notification-workspace-search">
                      <MessageNavigationIcon name="search" />
                      <input
                        type="search"
                        value={conversationSearch}
                        onChange={(event) =>
                          setConversationSearch(event.target.value)
                        }
                        placeholder={t("notificationWorkspace.search")}
                      />
                    </label>

                    <div
                      className="message-notification-mobile-actions"
                      aria-label={t("notificationWorkspace.actionsAria")}
                    >
                      <button
                        type="button"
                        onClick={() => void handleMarkAllNotificationsRead()}
                        disabled={
                          notificationUnreadCount === 0 ||
                          notificationBulkAction !== null ||
                          notificationDeletingId !== null
                        }
                        aria-busy={notificationBulkAction === "MARK_ALL_READ"}
                      >
                        {notificationBulkAction === "MARK_ALL_READ"
                          ? t("actions.marking")
                          : t("actions.markAllRead")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteReadNotifications()}
                        disabled={
                          notificationBulkAction !== null ||
                          notificationDeletingId !== null ||
                          !notifications.some(
                            (notification) => notification.isRead,
                          )
                        }
                        aria-busy={notificationBulkAction === "DELETE_READ"}
                      >
                        {notificationBulkAction === "DELETE_READ"
                          ? t("actions.removing")
                          : t("actions.removeSeen")}
                      </button>
                      <button
                        type="button"
                        onClick={() => openSettingsWorkspace("NOTIFICATIONS")}
                      >
                        {t("notificationWorkspace.settings")}
                      </button>
                    </div>
                  </div>

                  {notificationActionNotice && !notificationError && (
                    <div className="message-notification-mobile-feedback">
                      <p
                        className="message-inline-notice"
                        role="status"
                        aria-live="polite"
                      >
                        {notificationActionNotice}
                      </p>
                    </div>
                  )}

                  <div className="message-notification-workspace-list">
                    {notificationsLoading ? (
                      <div className="message-notification-workspace-empty">
                        {t("notificationWorkspace.loading")}
                      </div>
                    ) : notificationError ? (
                      <div className="message-notification-workspace-empty danger">
                        {notificationError}
                      </div>
                    ) : filteredNotifications.length === 0 ? (
                      <div className="message-notification-workspace-empty">
                        {conversationSearch.trim()
                          ? t("notificationWorkspace.noMatching")
                          : notificationListView === "UNREAD"
                            ? t("notificationWorkspace.allCaughtUp")
                            : t("notificationWorkspace.noneYet")}
                      </div>
                    ) : (
                      filteredNotifications.map((notification) => (
                        <article
                          key={notification.id}
                          className={`message-notification-row${notification.isRead ? "" : " unread"}`}
                        >
                          <button
                            type="button"
                            className="message-notification-open"
                            onClick={() =>
                              void handleNotificationClick(notification)
                            }
                          >
                            <span>
                              <strong>{notification.title}</strong>
                              <small>
                                {messagingSettings.notificationPreview
                                  ? notification.body
                                  : t("notification.previewHidden")}
                              </small>
                            </span>
                            <em>
                              {notificationTimestampLabel(
                                notification.createdAt,
                              )}
                            </em>
                          </button>
                          <button
                            type="button"
                            className="message-notification-delete"
                            aria-label={t("actions.removeNotificationAria", {
                              title: notification.title,
                            })}
                            onClick={() =>
                              void handleDeleteNotification(notification)
                            }
                            disabled={
                              notificationBulkAction !== null ||
                              notificationDeletingId !== null
                            }
                          >
                            {notificationDeletingId === notification.id
                              ? "…"
                              : "×"}
                          </button>
                        </article>
                      ))
                    )}
                  </div>
                </aside>

                <section className="message-notification-workspace-overview">
                  <div className="message-notification-workspace-actions">
                    <button
                      type="button"
                      onClick={() => void handleMarkAllNotificationsRead()}
                      disabled={
                        notificationUnreadCount === 0 ||
                        notificationBulkAction !== null ||
                        notificationDeletingId !== null
                      }
                      aria-busy={notificationBulkAction === "MARK_ALL_READ"}
                    >
                      {notificationBulkAction === "MARK_ALL_READ"
                        ? t("actions.marking")
                        : t("actions.markAllRead")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteReadNotifications()}
                      disabled={
                        notificationBulkAction !== null ||
                        notificationDeletingId !== null ||
                        !notifications.some(
                          (notification) => notification.isRead,
                        )
                      }
                      aria-busy={notificationBulkAction === "DELETE_READ"}
                    >
                      {notificationBulkAction === "DELETE_READ"
                        ? t("actions.removing")
                        : t("actions.removeSeen")}
                    </button>
                    <button
                      type="button"
                      onClick={() => openSettingsWorkspace("NOTIFICATIONS")}
                    >
                      {t("notificationWorkspace.notificationSettings")}
                    </button>
                  </div>

                  {notificationActionNotice && !notificationError && (
                    <p
                      className="message-inline-notice"
                      role="status"
                      aria-live="polite"
                    >
                      {notificationActionNotice}
                    </p>
                  )}
                  {notificationError && (
                    <p className="message-inline-error" role="alert">
                      {notificationError}
                    </p>
                  )}

                  <div className="message-notification-workspace-guide">
                    <span aria-hidden="true">N</span>
                    <h3>{t("notificationWorkspace.keepUp")}</h3>
                    <p>{t("notificationWorkspace.keepUpDescription")}</p>
                  </div>
                </section>
              </div>
            </div>
          ) : announcementMode ? (
            !selectedConversation ||
            selectedConversation.groupKind !== "OFFICIAL" ? (
              <div className="message-announcement-welcome-state">
                <span className="message-announcement-welcome-icon">
                  <MessageNavigationIcon name="announcement" />
                </span>
                <span>{t("announcementWorkspace.eyebrow")}</span>
                <h2>{t("announcementWorkspace.selectGroup")}</h2>
                <p>{t("announcementWorkspace.audienceNote")}</p>
              </div>
            ) : (
              <div className="message-announcement-group-workspace">
                <header className="message-announcement-workspace-header">
                  <span className="message-avatar-presence large">
                    {renderGroupAvatar(
                      selectedConversation,
                      "message-avatar large",
                    )}
                  </span>
                  <div className="message-announcement-group-heading">
                    <span>{t("announcementWorkspace.eyebrow")}</span>
                    <h2>
                      {selectedConversation.title ??
                        t("groupInfo.officialGroup")}
                    </h2>
                    <p>{officialScopeLabel(selectedConversation, t)}</p>
                  </div>
                  {canManageSelectedAnnouncementGroup && (
                    <button
                      type="button"
                      className="message-announcement-create-button"
                      onClick={openAnnouncementComposer}
                    >
                      <span aria-hidden="true">+</span>
                      {t("announcementWorkspace.newAnnouncement")}
                    </button>
                  )}
                </header>

                <section
                  className="message-announcement-feed"
                  aria-live="polite"
                  aria-busy={announcementLoading}
                >
                  {announcementComposerNotice && (
                    <div className="message-announcement-notice" role="status">
                      <strong>{t("announcementWorkspace.updated")}</strong>
                      <span>{announcementComposerNotice}</span>
                      <button
                        type="button"
                        onClick={() => setAnnouncementComposerNotice(null)}
                        aria-label={t("announcementWorkspace.dismissStatus")}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {announcementLoading ? (
                    <div
                      className="message-announcement-feed-state"
                      role="status"
                    >
                      <span
                        className="message-announcement-feed-mark"
                        aria-hidden="true"
                      >
                        <MessageNavigationIcon name="announcement" />
                      </span>
                      <h3>{t("announcementWorkspace.loading")}</h3>
                      <p>{t("announcementWorkspace.loadingDescription")}</p>
                    </div>
                  ) : announcementError ? (
                    <div
                      className="message-announcement-feed-state danger"
                      role="alert"
                    >
                      <span
                        className="message-announcement-feed-mark"
                        aria-hidden="true"
                      >
                        <MessageNavigationIcon name="announcement" />
                      </span>
                      <h3>{t("announcementWorkspace.loadError")}</h3>
                      <p>{announcementError}</p>
                      <button
                        type="button"
                        onClick={() =>
                          void loadSelectedGroupAnnouncements(
                            selectedConversation.id,
                          )
                        }
                      >
                        {t("announcementWorkspace.tryAgain")}
                      </button>
                    </div>
                  ) : announcementItems.length === 0 ? (
                    <div
                      className="message-announcement-feed-state"
                      role="status"
                    >
                      <span
                        className="message-announcement-feed-mark"
                        aria-hidden="true"
                      >
                        <MessageNavigationIcon name="announcement" />
                      </span>
                      <h3>{t("announcementWorkspace.noneYet")}</h3>
                      <p>{t("announcementWorkspace.emptyDescription")}</p>
                      {canManageSelectedAnnouncementGroup && (
                        <button
                          type="button"
                          onClick={openAnnouncementComposer}
                        >
                          {t("announcementWorkspace.createFirst")}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="message-announcement-card-list">
                      {announcementItems.map(renderAnnouncementCard)}
                    </div>
                  )}
                </section>
              </div>
            )
          ) : requestMode ? (
            !selectedMessageRequest ? (
              <div className="message-welcome-state message-collection-welcome-state--workspace request">
                <span
                  className="message-welcome-brand message-collection-welcome-icon"
                  aria-hidden="true"
                >
                  <MessageNavigationIcon name="requests" />
                </span>
                <span>{t("requestWorkspace.eyebrow")}</span>
                <h2>{t("requestWorkspace.selectRequest")}</h2>
                <p>{t("requestWorkspace.description")}</p>
                <div className="message-collection-welcome-metrics">
                  <span>
                    <strong>{messageRequests.counts.receivedPending}</strong>
                    <span>{t("requestWorkspace.received")}</span>
                  </span>
                  <span>
                    <strong>{messageRequests.counts.sentPending}</strong>
                    <span>{t("requestWorkspace.sent")}</span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="message-request-detail-workspace">
                <header className="message-request-detail-header">
                  <button
                    type="button"
                    className="message-mobile-back"
                    onClick={() => setSelectedRequestId(null)}
                    aria-label={t("requestWorkspace.back")}
                  >
                    ←
                  </button>
                  <span className="message-avatar-presence large">
                    {renderAccountAvatar(
                      selectedMessageRequest.peer,
                      "message-avatar large",
                    )}
                  </span>
                  <div>
                    <span>
                      {selectedMessageRequest.direction === "RECEIVED"
                        ? t("requestWorkspace.receivedRequest")
                        : t("requestWorkspace.sentRequest")}
                    </span>
                    <h2>{selectedMessageRequest.peer.displayName}</h2>
                    <p>
                      {selectedMessageRequest.peer.employee?.designation ??
                        roleLabel(selectedMessageRequest.peer.role, t)}
                    </p>
                  </div>
                  <strong className="message-request-detail-status">
                    {requestStatusLabel(selectedMessageRequest, t)}
                  </strong>
                </header>

                <section className="message-request-detail-body">
                  {requestError && (
                    <div className="message-inline-error" role="alert">
                      <p>{requestError}</p>
                    </div>
                  )}

                  <div className="message-request-detail-card">
                    <span>{t("requestWorkspace.why")}</span>
                    <h3>
                      {requestReasonLabel(selectedMessageRequest.reason, t)}
                    </h3>
                    <p>{t("requestWorkspace.approvalNote")}</p>
                  </div>

                  <dl className="message-request-detail-facts">
                    <div>
                      <dt>{t("requestWorkspace.requested")}</dt>
                      <dd>
                        {formatAnnouncementDate(
                          selectedMessageRequest.requestedAt,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("requestWorkspace.direction")}</dt>
                      <dd>
                        {selectedMessageRequest.direction === "RECEIVED"
                          ? t("requestWorkspace.receivedByYou")
                          : t("requestWorkspace.sentByYou")}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("requestWorkspace.status")}</dt>
                      <dd>{requestStatusLabel(selectedMessageRequest, t)}</dd>
                    </div>
                  </dl>

                  {selectedMessageRequest.direction === "RECEIVED" &&
                    selectedMessageRequest.status === "PENDING" && (
                      <div className="message-request-detail-actions">
                        <button
                          type="button"
                          className="accept"
                          onClick={() =>
                            void handleAcceptRequest(selectedMessageRequest)
                          }
                          disabled={requestActionId !== null}
                        >
                          {requestActionId === selectedMessageRequest.id
                            ? t("profileDetail.working")
                            : t("requestWorkspace.acceptAndOpen")}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDeclineRequest(selectedMessageRequest)
                          }
                          disabled={requestActionId !== null}
                        >
                          {t("requestWorkspace.decline")}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() =>
                            void handleBlockRequest(selectedMessageRequest)
                          }
                          disabled={requestActionId !== null}
                        >
                          {t("requestWorkspace.block")}
                        </button>
                      </div>
                    )}
                </section>
              </div>
            )
          ) : listMode && !selectedConversation ? (
            renderMessageListOverviewContent()
          ) : archivedMode && !selectedConversation ? (
            <div className="message-welcome-state message-collection-welcome-state--workspace">
              <span
                className="message-welcome-brand message-collection-welcome-icon"
                aria-hidden="true"
              >
                <MessageNavigationIcon name="archive" />
              </span>
              <span>{t("navigation.archivedConversations")}</span>
              <h2>{t("secondaryEmpty.archivedTitle")}</h2>
              <p>{t("secondaryEmpty.archivedDescription")}</p>
            </div>
          ) : starredMode && !selectedConversation ? (
            <div className="message-welcome-state message-collection-welcome-state--workspace starred">
              <span
                className="message-welcome-brand message-collection-welcome-icon"
                aria-hidden="true"
              >
                <MessageNavigationIcon name="starred" />
              </span>
              <span>{t("secondaryEmpty.starredEyebrow")}</span>
              <h2>{t("secondaryEmpty.starredTitle")}</h2>
              <p>{t("starred.openOriginalDescription")}</p>
              <small>{t("starred.personalNote")}</small>
            </div>
          ) : !selectedConversation ? (
            <div className="message-welcome-state">
              <div className="message-welcome-brand" aria-hidden="true">
                <img src="/nt-logo.png" alt="" />
              </div>
              <span>NT Message</span>
              <h2>{t("secondaryEmpty.secureTitle")}</h2>
              <p>{t("newConversationWorkspace.welcomeDescription")}</p>
              <div className="message-welcome-actions">
                <button type="button" onClick={openNewConversation}>
                  <MessageNavigationIcon name="newChat" />
                  {t("newConversationWorkspace.newConversation")}
                </button>
                <button type="button" onClick={openCreateGroup}>
                  <MessageNavigationIcon name="newGroup" />
                  {t("newConversationWorkspace.newGroup")}
                </button>
              </div>
              <small>{t("newConversationWorkspace.privacyNote")}</small>
            </div>
          ) : (
            <>
              <header className="message-chat-header">
                <button
                  type="button"
                  className="message-mobile-menu-button message-mobile-menu-button--chat"
                  onClick={() => setNavigationExpanded(true)}
                  aria-label={t("navigation.openMessagingNavigation")}
                >
                  <span aria-hidden="true">☰</span>
                </button>

                <button
                  type="button"
                  className="message-mobile-back"
                  onClick={() => setSelectedConversationId(null)}
                  aria-label={t("thread.header.backToConversations")}
                >
                  ←
                </button>

                <span className="message-avatar-presence large">
                  {selectedConversation.type === "PRIVATE" && peer ? (
                    renderAccountAvatar(peer, "message-avatar large")
                  ) : selectedConversation.type === "GROUP" ? (
                    renderGroupAvatar(
                      selectedConversation,
                      "message-avatar large",
                    )
                  ) : (
                    <span className="message-avatar large">
                      {initials(selectedConversation.title ?? "NT")}
                    </span>
                  )}

                  {peer?.showOnlineStatus !== false &&
                    selectedConversation.type === "PRIVATE" &&
                    peerPresence?.isOnline && (
                      <span
                        className="message-presence-dot"
                        aria-label={t("thread.header.onlineAria", {
                          name:
                            selectedConversation.title ??
                            t("thread.header.contactFallback"),
                        })}
                      />
                    )}
                </span>

                <div className="message-chat-identity">
                  <h2>
                    {selectedConversation.title ??
                      t("thread.header.privateConversation")}
                  </h2>
                  <p>
                    {selectedConversation.type === "GROUP"
                      ? selectedConversation.groupKind === "OFFICIAL"
                        ? officialScopeLabel(selectedConversation, t)
                        : t("thread.header.personalGroupMembers", {
                            count: selectedConversation.memberCount,
                          })
                      : [
                          peer?.employee?.designation ??
                            roleLabel(peer?.role ?? "EMPLOYEE", t),
                          employeeOrgContextLabel(peer?.employee ?? null, null),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                  </p>
                  <small
                    className={`message-peer-activity${
                      typingParticipants.length > 0
                        ? " typing"
                        : peer?.showOnlineStatus !== false &&
                            peerPresence?.isOnline
                          ? " online"
                          : ""
                    }`}
                    aria-live="polite"
                  >
                    {peerActivityLabel}
                  </small>
                </div>

                <div
                  className="message-chat-header-actions"
                  aria-label={t("thread.header.conversationActions")}
                >
                  <button
                    ref={messageSearchTriggerRef}
                    type="button"
                    className={searchPanelOpen ? "active" : ""}
                    onClick={() => openMessageSearchPanel()}
                    aria-expanded={searchPanelOpen}
                    aria-label={t("thread.header.searchConversation")}
                  >
                    <MessageNavigationIcon name="search" />
                  </button>

                  <button
                    type="button"
                    className={`message-chat-info-action${
                      detailsPanelOpen ? " active" : ""
                    }`}
                    onClick={() => {
                      closeMessageSearchPanel();

                      if (detailsPanelOpen) {
                        closeConversationDetailsPanel();
                      } else if (selectedConversation.type === "GROUP") {
                        openGroupInformation();
                      } else if (peer) {
                        openProfile(peer.accountId);
                      }
                    }}
                    aria-expanded={detailsPanelOpen}
                    aria-label={t("thread.header.openInformation")}
                  >
                    <MessageNavigationIcon name="info" />
                  </button>

                  <div className="message-conversation-menu-anchor">
                    <button
                      ref={conversationActionButtonRef}
                      type="button"
                      className={conversationActionMenuOpen ? "active" : ""}
                      onClick={() =>
                        setConversationActionMenuOpen((current) => !current)
                      }
                      aria-haspopup="menu"
                      aria-expanded={conversationActionMenuOpen}
                      aria-label={t("thread.header.moreActions")}
                    >
                      <MessageNavigationIcon name="more" />
                    </button>

                    {conversationActionMenuOpen && (
                      <div
                        ref={conversationActionMenuRef}
                        className="message-conversation-action-menu compact"
                        role="menu"
                        aria-label={t("thread.header.conversationActions")}
                        onKeyDown={(event) =>
                          handleLinearKeyboardNavigation(event, "VERTICAL")
                        }
                      >
                        {conversationActionMenuView === "MUTE" ? (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() =>
                                setConversationActionMenuView("ROOT")
                              }
                            >
                              <span aria-hidden="true">←</span>
                              <span>
                                {t("thread.header.muteNotifications")}
                              </span>
                            </button>
                            {(
                              [
                                ["1_HOUR", t("thread.header.mute1Hour")],
                                ["8_HOURS", t("thread.header.mute8Hours")],
                                ["1_WEEK", t("thread.header.mute1Week")],
                                ["ALWAYS", t("thread.header.muteAlways")],
                              ] as Array<[ConversationMuteSetting, string]>
                            ).map(([value, label]) => (
                              <button
                                key={value}
                                type="button"
                                role="menuitem"
                                disabled={
                                  conversationPreferenceLoading ===
                                  selectedConversation.id
                                }
                                onClick={() => {
                                  setConversationActionMenuOpen(false);
                                  void changeConversationMute(
                                    selectedConversation,
                                    value,
                                  );
                                }}
                              >
                                <MessageNavigationIcon name="bell" />
                                <span>{label}</span>
                              </button>
                            ))}
                          </>
                        ) : (
                          <>
                            {(selectedConversation.type === "PRIVATE" ||
                              selectedConversation.canManageGroup) && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setConversationActionMenuOpen(false);
                                  if (selectedConversation.type === "PRIVATE") {
                                    openPrivateGroupDialog();
                                  } else {
                                    openManageGroup();
                                  }
                                }}
                              >
                                <MessageNavigationIcon name="addUser" />
                                <span>
                                  {selectedConversation.type === "PRIVATE"
                                    ? t("thread.header.addMember")
                                    : t("thread.header.manageGroupMembers")}
                                </span>
                              </button>
                            )}

                            <button
                              type="button"
                              role="menuitem"
                              disabled={
                                conversationPreferenceLoading ===
                                selectedConversation.id
                              }
                              onClick={() => {
                                setConversationActionMenuOpen(false);
                                void toggleConversationFavorite(
                                  selectedConversation,
                                );
                              }}
                            >
                              <MessageNavigationIcon name="starred" />
                              <span>
                                {selectedConversation.isFavorite
                                  ? t("thread.header.removeFavorite")
                                  : t("thread.header.addFavorite")}
                              </span>
                            </button>

                            {selectedConversation.isMuted ? (
                              <button
                                type="button"
                                role="menuitem"
                                disabled={
                                  conversationPreferenceLoading ===
                                  selectedConversation.id
                                }
                                onClick={() => {
                                  setConversationActionMenuOpen(false);
                                  void changeConversationMute(
                                    selectedConversation,
                                    "OFF",
                                  );
                                }}
                              >
                                <MessageNavigationIcon name="bell" />
                                <span>
                                  {t("thread.header.unmuteNotifications")}
                                </span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() =>
                                  setConversationActionMenuView("MUTE")
                                }
                              >
                                <MessageNavigationIcon name="bell" />
                                <span>
                                  {t("thread.header.muteNotificationsMore")}
                                </span>
                              </button>
                            )}

                            {peer && (
                              <button
                                type="button"
                                role="menuitem"
                                disabled={blockActionAccountId !== null}
                                onClick={() => {
                                  setConversationActionMenuOpen(false);

                                  if (blockedAccountIds.has(peer.accountId)) {
                                    void handleUnblockAccount(peer.accountId);
                                  } else {
                                    openDestructiveConfirmation({
                                      kind: "BLOCK_PRIVATE_CONTACT",
                                      target: peer,
                                    });
                                  }
                                }}
                              >
                                <MessageNavigationIcon name="block" />
                                <span>
                                  {blockedAccountIds.has(peer.accountId)
                                    ? t("conversationList.unblockContact")
                                    : t("conversationList.blockContact")}
                                </span>
                              </button>
                            )}

                            <button
                              type="button"
                              role="menuitem"
                              onClick={closeActiveConversation}
                            >
                              <MessageNavigationIcon name="close" />
                              <span>
                                {t("thread.header.closeConversation")}
                              </span>
                            </button>

                            <div
                              className="message-conversation-action-menu-divider"
                              role="separator"
                            />

                            <button
                              type="button"
                              role="menuitem"
                              className="message-conversation-history-action"
                              onClick={() =>
                                openConversationHistoryConfirmation(
                                  "CLEAR",
                                  selectedConversation.id,
                                )
                              }
                            >
                              <MessageNavigationIcon name="close" />
                              <span>{t("thread.header.clearChat")}</span>
                            </button>

                            {selectedConversation.type === "PRIVATE" && (
                              <button
                                type="button"
                                role="menuitem"
                                className="message-conversation-history-action destructive"
                                onClick={() =>
                                  openConversationHistoryConfirmation(
                                    "DELETE",
                                    selectedConversation.id,
                                  )
                                }
                              >
                                <MessageNavigationIcon name="trash" />
                                <span>{t("thread.header.deleteChat")}</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </header>

              {messageError && (
                <div className="message-chat-error" role="alert">
                  <span>{messageError}</span>
                  <button
                    type="button"
                    onClick={() => setMessageError(null)}
                    aria-label={t("thread.dismissError")}
                  >
                    ×
                  </button>
                </div>
              )}

              {messageNotice && (
                <div
                  className="message-action-toast"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <span
                    className="message-action-toast-icon"
                    aria-hidden="true"
                  >
                    i
                  </span>
                  <span>{messageNotice}</span>
                </div>
              )}

              {inviteJoinLoading && (
                <div
                  className="message-chat-notice"
                  role="status"
                  aria-live="polite"
                >
                  <span>{t("privateGroup.joiningInvite")}</span>
                </div>
              )}

              {activePinnedMessage && (
                <section
                  className="message-pinned-strip"
                  aria-label={t("thread.pinned.aria")}
                >
                  <button
                    type="button"
                    className="message-pinned-strip-main"
                    onClick={() => focusPinnedMessage(activePinnedMessage)}
                  >
                    <span
                      className="message-pinned-strip-icon"
                      aria-hidden="true"
                    >
                      📌
                    </span>
                    <span className="message-pinned-strip-copy">
                      <strong>
                        {activePinnedMessage.sender.displayName}:{" "}
                        {localizedAttachmentLabel(activePinnedMessage)}
                      </strong>
                      <small>
                        {t("pinnedBrowser.position", {
                          current: normalizedPinnedMessageIndex + 1,
                          total: visiblePinnedMessages.length,
                        })}
                      </small>
                    </span>
                  </button>

                  <div className="message-pinned-strip-actions">
                    <button
                      type="button"
                      onClick={() => movePinnedMessageSelection(-1)}
                      disabled={visiblePinnedMessages.length < 2}
                      aria-label={t("thread.pinned.previous")}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() => movePinnedMessageSelection(1)}
                      disabled={visiblePinnedMessages.length < 2}
                      aria-label={t("thread.pinned.next")}
                    >
                      ›
                    </button>
                    <button
                      type="button"
                      className="message-pinned-strip-browse"
                      onClick={() => setPinnedMessageBrowserOpen(true)}
                    >
                      {t("thread.pinned.all")}
                    </button>
                  </div>
                </section>
              )}

              <div className="message-thread-shell">
                <div
                  className="message-thread"
                  ref={messageListRef}
                  onScroll={handleMessageThreadScroll}
                  onWheelCapture={releaseInitialMessageBottomAnchor}
                  onTouchStartCapture={releaseInitialMessageBottomAnchor}
                  onPointerDownCapture={releaseInitialMessageBottomAnchor}
                  onKeyDownCapture={releaseInitialMessageBottomAnchor}
                  aria-busy={messageLoading || olderMessagesLoading}
                >
                  <div
                    ref={messageThreadContentRef}
                    className="message-thread-content"
                  >
                    {!messageLoading && displayMessages.length > 0 && (
                      <div
                        className="message-thread-spacer"
                        aria-hidden="true"
                      />
                    )}

                    {hasOlderMessages && (
                      <button
                        type="button"
                        className="message-load-older"
                        onClick={() => void handleLoadOlderMessages()}
                        disabled={olderMessagesLoading}
                      >
                        {olderMessagesLoading
                          ? t("thread.loadingOlder")
                          : t("thread.loadOlder")}
                      </button>
                    )}

                    {messageLoading ? (
                      <div
                        className="message-thread-state"
                        role="status"
                        aria-live="polite"
                      >
                        <span
                          className="message-small-spinner"
                          aria-hidden="true"
                        />
                        <p>{t("thread.loadingMessages")}</p>
                      </div>
                    ) : messages.length === 0 ? (
                      <div
                        className={`message-thread-state${
                          selectedConversation.historyClearedAt
                            ? " cleared-history"
                            : ""
                        }`}
                        role="status"
                      >
                        <div className="message-empty-icon">
                          {selectedConversation.historyClearedAt ? "✓" : "Hi"}
                        </div>
                        <h3>
                          {selectedConversation.historyClearedAt
                            ? t("thread.clearedTitle")
                            : t("thread.startTitle")}
                        </h3>
                        <p>
                          {selectedConversation.historyClearedAt
                            ? t("thread.clearedDescription")
                            : t("thread.startDescription", {
                                name: selectedConversation.title,
                              })}
                        </p>
                      </div>
                    ) : (
                      displayMessages.map((message, index) => {
                        const ownMessage =
                          message.senderAccountId === account?.id;
                        const officialAnnouncement =
                          getOfficialAnnouncementPayload(message, t);
                        const previousMessage = displayMessages[index - 1];
                        const nextMessage = displayMessages[index + 1];
                        const showDaySeparator =
                          !previousMessage ||
                          !isSameCalendarDay(
                            previousMessage.sentAt,
                            message.sentAt,
                          );
                        const groupedWithPrevious =
                          messagesBelongToSameVisualGroup(
                            previousMessage,
                            message,
                          );
                        const groupedWithNext = messagesBelongToSameVisualGroup(
                          message,
                          nextMessage,
                        );
                        const showSenderName =
                          selectedConversation.type === "GROUP" &&
                          !ownMessage &&
                          !groupedWithPrevious;
                        const deliveryPresentation = ownMessage
                          ? messageDeliveryPresentation(message.deliveryStatus)
                          : null;
                        const hasAttachments =
                          (message.attachments?.length ?? 0) > 0;
                        const isLocationMessage =
                          message.contentType === "LOCATION";
                        const attachmentOnlyMessage =
                          !message.isDeleted &&
                          !message.replyTo &&
                          !message.forwardedFrom &&
                          !officialAnnouncement &&
                          (isLocationMessage ||
                            (!message.textContent && hasAttachments));
                        const simpleTextMessage =
                          !message.isDeleted &&
                          !message.replyTo &&
                          !message.forwardedFrom &&
                          !officialAnnouncement &&
                          !isLocationMessage &&
                          !hasAttachments &&
                          Boolean(message.textContent?.trim());
                        const messageMeta = (
                          <span
                            className={`message-bubble-meta${
                              attachmentOnlyMessage ? "" : " inside-bubble"
                            }`}
                          >
                            {!message.isDeleted &&
                              (message.isPinned || message.isStarred) && (
                                <span
                                  className="message-state-icons"
                                  aria-label={[
                                    message.isPinned
                                      ? t("thread.message.pinned")
                                      : null,
                                    message.isStarred
                                      ? t("thread.message.starred")
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" and ")}
                                >
                                  {message.isPinned && (
                                    <span
                                      className="message-state-icon is-pinned"
                                      title={t("thread.message.pinned")}
                                    >
                                      <MessageStatusGlyph name="pin" />
                                    </span>
                                  )}
                                  {message.isStarred && (
                                    <span
                                      className="message-state-icon is-starred"
                                      title={t("thread.message.starred")}
                                    >
                                      <MessageStatusGlyph name="star" />
                                    </span>
                                  )}
                                </span>
                              )}

                            <time>{formatMessageTime(message.sentAt)}</time>

                            {message.editedAt && !message.isDeleted && (
                              <span>{t("thread.message.edited")}</span>
                            )}

                            {deliveryPresentation && (
                              <span
                                className={`message-delivery ${message.deliveryStatus.toLowerCase()}`}
                                aria-label={deliveryPresentation.label}
                                title={deliveryPresentation.label}
                              >
                                <span aria-hidden="true">
                                  {deliveryPresentation.glyph}
                                </span>
                              </span>
                            )}
                          </span>
                        );

                        return (
                          <Fragment key={message.id}>
                            {showDaySeparator && (
                              <div
                                className="message-day-separator"
                                role="separator"
                              >
                                <span>{formatMessageDay(message.sentAt)}</span>
                              </div>
                            )}

                            <article
                              data-message-id={message.id}
                              className={`message-bubble-row${
                                ownMessage ? " own" : ""
                              }${
                                groupedWithPrevious
                                  ? " grouped grouped-with-previous"
                                  : " group-start"
                              }${groupedWithNext ? " grouped-with-next" : " group-end"}${officialAnnouncement ? " official-announcement" : ""}${highlightedMessageId === message.id ? " search-highlight" : ""}${
                                openMessageMenuId === message.id ||
                                openReactionMenuId === message.id
                                  ? " actions-open"
                                  : ""
                              }${
                                activeMobileMessageId === message.id
                                  ? " mobile-action-selected"
                                  : ""
                              }${hasAttachments ? " has-attachments" : ""}${
                                isLocationMessage ? " has-location" : ""
                              }${attachmentOnlyMessage ? " attachment-only" : ""}${simpleTextMessage ? " simple-text-message" : ""}${message.isDeleted ? " is-deleted" : ""}`}
                              onPointerEnter={(event) =>
                                handleMessagePointerEnter(message.id, event)
                              }
                              onPointerDown={(event) =>
                                handleMobileMessagePointerDown(message, event)
                              }
                              onPointerMove={handleMobileMessagePointerMove}
                              onPointerUp={handleMobileMessagePointerEnd}
                              onPointerCancel={handleMobileMessagePointerEnd}
                              onContextMenu={(event) =>
                                handleMobileMessageContextMenu(
                                  message.id,
                                  event,
                                )
                              }
                            >
                              {!ownMessage && !groupedWithPrevious ? (
                                renderAccountAvatar(
                                  message.sender,
                                  "message-avatar small",
                                )
                              ) : !ownMessage ? (
                                <span
                                  className="message-avatar-spacer"
                                  aria-hidden="true"
                                />
                              ) : null}

                              <div className="message-bubble-wrap">
                                {showSenderName && (
                                  <strong className="message-sender-name">
                                    {message.sender.displayName}
                                  </strong>
                                )}

                                <div className="message-bubble-line">
                                  <div className="message-bubble">
                                    {officialAnnouncement &&
                                      !message.isDeleted && (
                                        <div className="message-announcement-label">
                                          <strong>
                                            {officialAnnouncement.label}
                                          </strong>
                                          <span>
                                            {t(
                                              "thread.message.officialBroadcast",
                                            )}
                                          </span>
                                        </div>
                                      )}

                                    {message.forwardedFrom &&
                                      !message.isDeleted && (
                                        <div className="message-forwarded-label">
                                          <svg
                                            viewBox="0 0 24 24"
                                            aria-hidden="true"
                                          >
                                            <path d="m14 5 6 7-6 7v-4H9c-3.3 0-5.7 1.1-7 3 1-5.4 4-8 9-8h3V5Z" />
                                          </svg>
                                          <span>
                                            {t("thread.message.forwarded")}
                                          </span>
                                        </div>
                                      )}

                                    {message.replyTo && !message.isDeleted && (
                                      <button
                                        type="button"
                                        className="message-reply-preview"
                                        onClick={() =>
                                          void focusReplySource(message)
                                        }
                                        disabled={message.replyTo.isDeleted}
                                        aria-label={
                                          message.replyTo.isDeleted
                                            ? t(
                                                "thread.message.originalReplyUnavailable",
                                              )
                                            : t(
                                                "thread.message.openOriginalReply",
                                              )
                                        }
                                      >
                                        <strong>
                                          {message.replyTo.senderAccountId ===
                                          account?.id
                                            ? t("thread.message.you")
                                            : message.replyTo.sender
                                                .displayName}
                                        </strong>
                                        <span>
                                          {message.replyTo.isDeleted
                                            ? t("thread.message.deleted")
                                            : (message.replyTo.textContent ??
                                              t("thread.message.fallback"))}
                                        </span>
                                      </button>
                                    )}

                                    {message.isDeleted ? (
                                      <em>
                                        {t("thread.message.deletedSentence")}
                                      </em>
                                    ) : (
                                      <>
                                        {message.textContent &&
                                          message.contentType !== "LOCATION" &&
                                          (simpleTextMessage ? (
                                            <span className="message-simple-text">
                                              <span className="message-simple-text-content">
                                                {renderMessageTextWithMentions(
                                                  message,
                                                )}
                                              </span>
                                              {messageMeta}
                                            </span>
                                          ) : (
                                            <p>
                                              {renderMessageTextWithMentions(
                                                message,
                                              )}
                                            </p>
                                          ))}

                                        {message.contentType === "LOCATION" && (
                                          <LocationMessageCard
                                            message={message}
                                            viewerAccountId={account?.id}
                                            stopping={
                                              locationActionLoading ===
                                                "STOP" &&
                                              (activeLiveLocation?.messageId ===
                                                message.id ||
                                                message.senderAccountId ===
                                                  account?.id)
                                            }
                                            onStop={(selected) =>
                                              void handleStopLiveLocation(
                                                selected,
                                              )
                                            }
                                          />
                                        )}

                                        {(message.attachments?.length ?? 0) >
                                          0 && (
                                          <div className="message-attachments-v2">
                                            {(message.attachments ?? []).map(
                                              (attachment) => (
                                                <MessageAttachmentCard
                                                  key={attachment.id}
                                                  accessToken={accessToken}
                                                  conversationId={
                                                    message.conversationId
                                                  }
                                                  messageId={message.id}
                                                  attachment={attachment}
                                                  isVoiceNote={
                                                    getMessagePayloadValue(
                                                      message,
                                                      "attachmentKind",
                                                    ) === "VOICE_NOTE"
                                                  }
                                                  senderDisplayName={
                                                    message.sender.displayName
                                                  }
                                                  senderPhotoUrl={
                                                    profilePhotoUrls[
                                                      message.sender.accountId
                                                    ] ?? null
                                                  }
                                                  onPreview={(selected) =>
                                                    void handlePreviewAttachment(
                                                      message,
                                                      selected,
                                                    )
                                                  }
                                                  onMediaLayoutReady={
                                                    handleMessageMediaLayoutReady
                                                  }
                                                />
                                              ),
                                            )}
                                          </div>
                                        )}
                                      </>
                                    )}

                                    {!attachmentOnlyMessage &&
                                      !simpleTextMessage &&
                                      messageMeta}
                                  </div>

                                  <div
                                    className="message-bubble-actions"
                                    data-message-action-root={message.id}
                                    role="toolbar"
                                    aria-label={t(
                                      "thread.message.quickActions",
                                    )}
                                    onKeyDown={(event) =>
                                      handleLinearKeyboardNavigation(
                                        event,
                                        "HORIZONTAL",
                                      )
                                    }
                                  >
                                    {!message.isDeleted && (
                                      <button
                                        type="button"
                                        className="message-action-react"
                                        data-message-reaction-trigger={
                                          message.id
                                        }
                                        onClick={(event) =>
                                          toggleReactionMenu(
                                            message.id,
                                            ownMessage,
                                            event,
                                          )
                                        }
                                        disabled={reactionActionId !== null}
                                        aria-expanded={
                                          openReactionMenuId === message.id
                                        }
                                        aria-haspopup="true"
                                        aria-label={t(
                                          "actionsMenu.reactToMessage",
                                        )}
                                        title={t("actionsMenu.react")}
                                      >
                                        <MessageNavigationIcon name="react" />
                                      </button>
                                    )}

                                    {!message.isDeleted && (
                                      <button
                                        type="button"
                                        className="message-action-reply"
                                        onClick={() => beginReply(message)}
                                        disabled={messageActionId !== null}
                                        aria-label={t(
                                          "actionsMenu.replyToMessage",
                                        )}
                                        title={t("actionsMenu.reply")}
                                      >
                                        <MessageNavigationIcon name="reply" />
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      className="message-action-more"
                                      data-message-action-trigger={message.id}
                                      onClick={(event) =>
                                        toggleMessageActionMenu(
                                          message.id,
                                          ownMessage,
                                          event,
                                        )
                                      }
                                      aria-expanded={
                                        openMessageMenuId === message.id
                                      }
                                      aria-haspopup="menu"
                                      aria-label={t("actionsMenu.openMore")}
                                      title={t("actionsMenu.moreActions")}
                                    >
                                      <MessageNavigationIcon name="more" />
                                    </button>
                                  </div>
                                </div>

                                {attachmentOnlyMessage && messageMeta}

                                {(message.reactions?.length ?? 0) > 0 && (
                                  <div
                                    className={`message-reactions${
                                      ownMessage ? " own" : ""
                                    }`}
                                  >
                                    {groupMessageReactions(
                                      message,
                                      account?.id,
                                      t,
                                    ).map((reactionGroup) => (
                                      <button
                                        key={reactionGroup.emoji}
                                        type="button"
                                        className={
                                          reactionGroup.reactedByViewer
                                            ? "message-reaction-chip message-reaction-chip-own"
                                            : "message-reaction-chip"
                                        }
                                        title={reactionGroup.label}
                                        aria-label={`${reactionGroup.emoji} reaction from ${reactionGroup.count} participant${
                                          reactionGroup.count === 1 ? "" : "s"
                                        }`}
                                        onClick={() =>
                                          void handleReaction(
                                            message,
                                            reactionGroup.emoji,
                                          )
                                        }
                                        disabled={reactionActionId !== null}
                                      >
                                        <span>{reactionGroup.emoji}</span>
                                        {reactionGroup.count > 1 && (
                                          <span>{reactionGroup.count}</span>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </article>
                          </Fragment>
                        );
                      })
                    )}

                    {typingParticipants.length > 0 && (
                      <div
                        className="message-typing-indicator"
                        aria-live="polite"
                      >
                        {renderAccountAvatar(
                          typingParticipants[0],
                          "message-avatar small",
                        )}
                        <span className="message-typing-bubble">
                          <span aria-hidden="true">
                            <i />
                            <i />
                            <i />
                          </span>
                          <small>{peerActivityLabel}</small>
                        </span>
                      </div>
                    )}
                    <div className="message-thread-bottom" aria-hidden="true" />
                  </div>
                </div>

                {(showJumpToLatest || newMessageCount > 0) && (
                  <button
                    type="button"
                    className="message-new-messages-button"
                    onClick={jumpToLatestMessages}
                    aria-label={
                      newMessageCount > 0
                        ? t("thread.jumpWithNew", { count: newMessageCount })
                        : t("thread.jumpToLatestMessage")
                    }
                    title={t("thread.jumpToLatest")}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="m6.5 9 5.5 5.5L17.5 9" />
                    </svg>
                    {newMessageCount > 0 && (
                      <span className="message-new-messages-count">
                        {newMessageCount > 99 ? "99+" : newMessageCount}
                      </span>
                    )}
                  </button>
                )}
              </div>

              <form
                className="message-composer"
                onSubmit={(event) => void handleSendMessage(event)}
              >
                {(replyingTo || editingMessage) && (
                  <div className="message-composer-context">
                    <span>
                      <strong>
                        {editingMessage
                          ? t("composer.editingMessage")
                          : t("composer.replyingTo", {
                              name:
                                replyingTo?.senderAccountId === account?.id
                                  ? t("composer.yourself")
                                  : (replyingTo?.sender.displayName ??
                                    t("thread.message.fallback").toLowerCase()),
                            })}
                      </strong>
                      <small>
                        {(editingMessage ?? replyingTo)?.textContent ??
                          t("thread.message.fallback")}
                      </small>
                    </span>

                    <button
                      type="button"
                      onClick={cancelMessageAction}
                      aria-label={t("composer.cancelAction")}
                    >
                      ×
                    </button>
                  </div>
                )}

                {selectedAttachments.length > 0 && (
                  <div className="message-selected-attachments">
                    <header className="message-selected-attachments-header">
                      <span>
                        <strong>
                          {selectedAttachmentKind === "VOICE_NOTE"
                            ? t("attachment.voiceNote")
                            : t("composer.selectedAttachments", {
                                count: selectedAttachments.length,
                              })}
                        </strong>
                        <small>
                          {formatFileSize(
                            selectedAttachments.reduce(
                              (total, attachment) =>
                                total + attachment.file.size,
                              0,
                            ),
                          )}
                          {selectedAttachmentKind === "FILE"
                            ? ` · ${t("composer.attachmentsRemaining", {
                                count:
                                  MAX_MESSAGE_ATTACHMENT_FILES -
                                  selectedAttachments.length,
                              })}`
                            : ""}
                        </small>
                      </span>

                      <button
                        type="button"
                        onClick={clearSelectedAttachment}
                        disabled={sendingMessage}
                        aria-label={t("composer.removeAllAttachments")}
                      >
                        {t("composer.clearAttachments")}
                      </button>
                    </header>

                    <div className="message-selected-attachment-list">
                      {selectedAttachments.map((attachment) => {
                        const { file, previewUrl } = attachment;

                        return (
                          <div
                            key={attachment.id}
                            className="message-selected-attachment"
                          >
                            {previewUrl && file.type.startsWith("image/") && (
                              <img src={previewUrl} alt={file.name} />
                            )}

                            {previewUrl && file.type.startsWith("video/") && (
                              <video
                                src={previewUrl}
                                muted
                                playsInline
                                preload="metadata"
                              />
                            )}

                            {previewUrl && file.type.startsWith("audio/") && (
                              <div className="message-selected-audio">
                                <span aria-hidden="true">♪</span>
                                <audio
                                  src={previewUrl}
                                  controls
                                  preload="metadata"
                                >
                                  {t("attachment.audioUnsupported")}
                                </audio>
                              </div>
                            )}

                            {!previewUrl && (
                              <div
                                className="message-selected-document"
                                aria-hidden="true"
                              >
                                <AttachmentGlyph name="document" />
                              </div>
                            )}

                            <span>
                              <strong>
                                {selectedAttachmentKind === "VOICE_NOTE"
                                  ? t("attachment.voiceNote")
                                  : file.name}
                              </strong>
                              <small>{formatFileSize(file.size)}</small>
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                removeSelectedAttachment(attachment.id)
                              }
                              disabled={sendingMessage}
                              aria-label={t("composer.removeAttachment", {
                                name: file.name,
                              })}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {attachmentUpload.status !== "IDLE" && (
                      <div className="message-attachment-upload-state">
                        <div className="message-attachment-upload-meta">
                          <small>
                            {attachmentUpload.status === "FAILED"
                              ? t("composer.uploadFailed")
                              : attachmentUpload.progressPercent > 0
                                ? attachmentUpload.totalBytes
                                  ? t("composer.uploadingDetailed", {
                                      percent: attachmentUpload.progressPercent,
                                      loaded: formatFileSize(
                                        attachmentUpload.loadedBytes,
                                      ),
                                      total: formatFileSize(
                                        attachmentUpload.totalBytes,
                                      ),
                                    })
                                  : t("composer.uploading", {
                                      percent: attachmentUpload.progressPercent,
                                    })
                                : t("composer.startingUpload")}
                          </small>
                          {attachmentUpload.status === "FAILED" && (
                            <button
                              type="button"
                              onClick={() => void handleSendMessage()}
                              disabled={sendingMessage}
                            >
                              {t("actions.retry")}
                            </button>
                          )}
                        </div>
                        <div
                          className={`message-attachment-upload-track${attachmentUpload.status === "FAILED" ? " failed" : ""}`}
                          aria-label={t("composer.uploadProgress")}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={attachmentUpload.progressPercent}
                          role="progressbar"
                        >
                          <span
                            style={{
                              width: `${attachmentUpload.progressPercent}%`,
                            }}
                          />
                        </div>
                        {attachmentUpload.error && (
                          <small className="message-attachment-upload-error">
                            {attachmentUpload.error}
                          </small>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept={ACCEPTED_ATTACHMENT_TYPES}
                  multiple
                  className="message-attachment-input"
                  onChange={handleAttachmentChange}
                  disabled={
                    sendingMessage ||
                    editingMessage !== null ||
                    voiceRecordingState !== "IDLE"
                  }
                  aria-label={t("composer.chooseAttachment")}
                />

                {mentionPanelVisible && activeMentionQuery && (
                  <div className="message-mention-suggestions">
                    <div className="message-mention-suggestions-header">
                      <strong>{t("composer.mentionMember")}</strong>
                      <small>
                        {activeMentionQuery.query
                          ? t("composer.matchingMembers")
                          : t("composer.mentionHint")}
                      </small>
                    </div>

                    <div
                      id="message-mention-suggestions"
                      className="message-mention-options"
                      role="listbox"
                      aria-label={t("composer.mentionGroupMember")}
                      onScroll={(event) => {
                        if (
                          selectedConversation?.groupKind !== "OFFICIAL" ||
                          !officialMentionHasMore ||
                          officialMentionLoadingMore
                        ) {
                          return;
                        }

                        const target = event.currentTarget;
                        if (
                          target.scrollHeight -
                            target.scrollTop -
                            target.clientHeight <
                          56
                        ) {
                          void loadMoreOfficialMentionSuggestions();
                        }
                      }}
                    >
                      {mentionSuggestions.map((participant, index) => (
                        <button
                          id={`message-mention-option-${participant.accountId}`}
                          key={participant.accountId}
                          type="button"
                          role="option"
                          className={
                            index === activeMentionSuggestionIndex
                              ? "is-keyboard-active"
                              : undefined
                          }
                          aria-selected={index === activeMentionSuggestionIndex}
                          tabIndex={-1}
                          onMouseEnter={() =>
                            setActiveMentionSuggestionIndex(index)
                          }
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleMentionSelect(participant)}
                        >
                          {renderAccountAvatar(
                            participant,
                            "message-avatar small",
                          )}
                          <span>
                            <strong>{participant.displayName}</strong>
                            <small>
                              {participant.employee?.designation ??
                                participant.username ??
                                t("groupManagement.groupMember")}
                            </small>
                          </span>
                        </button>
                      ))}

                      {selectedConversation?.groupKind === "OFFICIAL" &&
                        officialMentionLoading && (
                          <div className="message-mention-status" role="status">
                            {t("groupInfo.loadingMembers")}
                          </div>
                        )}

                      {selectedConversation?.groupKind === "OFFICIAL" &&
                        !officialMentionLoading &&
                        mentionSuggestions.length === 0 && (
                          <div className="message-mention-status">
                            {officialMentionError ??
                              t("composer.noMatchingMembers")}
                          </div>
                        )}
                    </div>

                    {selectedConversation?.groupKind === "OFFICIAL" &&
                      officialMentionHasMore && (
                        <button
                          type="button"
                          className="message-mention-more"
                          disabled={officialMentionLoadingMore}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() =>
                            void loadMoreOfficialMentionSuggestions()
                          }
                        >
                          {officialMentionLoadingMore
                            ? t("composer.loadingMore")
                            : t("composer.loadMoreMembers")}
                        </button>
                      )}

                    {selectedConversation?.groupKind === "OFFICIAL" &&
                      officialMentionError &&
                      mentionSuggestions.length > 0 && (
                        <small className="message-mention-error">
                          {officialMentionError}
                        </small>
                      )}
                  </div>
                )}

                {voiceRecordingState !== "IDLE" ? (
                  <div
                    className="message-voice-recorder-bar"
                    role="status"
                    aria-live="polite"
                  >
                    <span
                      className="message-recording-indicator"
                      aria-hidden="true"
                    >
                      <span className="message-recording-dot" />
                    </span>
                    <span className="message-recording-copy">
                      <strong>
                        {voiceRecordingState === "STOPPING"
                          ? t("composer.preparingVoiceNote")
                          : t("composer.recordingVoiceNote")}
                      </strong>
                      <small>
                        {formatRecordingDuration(voiceRecordingSeconds)}
                      </small>
                    </span>
                    <span
                      className="message-recording-waveform"
                      aria-hidden="true"
                    >
                      {Array.from({ length: 18 }, (_, index) => (
                        <i key={index} />
                      ))}
                    </span>
                    <button
                      type="button"
                      className="message-recording-cancel"
                      onClick={cancelVoiceRecording}
                    >
                      {t("actions.cancel")}
                    </button>
                    <button
                      type="button"
                      className="message-recording-stop"
                      onClick={finishVoiceRecording}
                      disabled={voiceRecordingState !== "RECORDING"}
                    >
                      {voiceRecordingState === "STOPPING"
                        ? t("composer.preparing")
                        : t("composer.stopAndAttach")}
                    </button>
                  </div>
                ) : (
                  <div
                    className={`message-composer-main${
                      showVoiceRecordAction ? "" : " no-voice-action"
                    }`}
                  >
                    <div
                      ref={attachmentMenuRef}
                      className="message-attachment-menu-wrapper"
                    >
                      <button
                        ref={attachmentMenuButtonRef}
                        type="button"
                        className="message-composer-control message-composer-plus"
                        onClick={() => {
                          setComposerEmojiOpen(false);
                          setAttachmentMenuView("ROOT");
                          setAttachmentMenuOpen((value) => !value);
                        }}
                        aria-expanded={attachmentMenuOpen}
                        aria-label={t("composer.openAttachmentOptions")}
                        disabled={sendingMessage || editingMessage !== null}
                      >
                        <span aria-hidden="true">+</span>
                      </button>

                      {attachmentMenuOpen && (
                        <div
                          className={`message-attachment-menu${attachmentMenuView === "LIVE_LOCATION" ? " live-step" : ""}`}
                          role="dialog"
                          aria-label={t("composer.attachmentOptions")}
                          onKeyDown={(event) =>
                            handleLinearKeyboardNavigation(event, "BOTH")
                          }
                        >
                          <header className="message-composer-popover-header">
                            {attachmentMenuView === "LIVE_LOCATION" ? (
                              <button
                                type="button"
                                className="message-popover-back"
                                onClick={() => setAttachmentMenuView("ROOT")}
                                aria-label={t("composer.backAttachmentOptions")}
                              >
                                ←
                              </button>
                            ) : (
                              <span
                                className="message-popover-header-spacer"
                                aria-hidden="true"
                              />
                            )}
                            <strong>
                              {attachmentMenuView === "LIVE_LOCATION"
                                ? t("composer.liveLocation")
                                : t("composer.attach")}
                            </strong>
                            <button
                              type="button"
                              className="message-popover-close"
                              onClick={() => {
                                setAttachmentMenuOpen(false);
                                setAttachmentMenuView("ROOT");
                                window.requestAnimationFrame(() =>
                                  attachmentMenuButtonRef.current?.focus(),
                                );
                              }}
                              aria-label={t("composer.closeAttachmentOptions")}
                            >
                              ×
                            </button>
                          </header>

                          {attachmentMenuView === "ROOT" ? (
                            <>
                              <div className="message-attachment-menu-grid">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openAttachmentPicker(MEDIA_ATTACHMENT_TYPES)
                                  }
                                  disabled={sendingMessage}
                                >
                                  <span className="media">
                                    <AttachmentGlyph name="image" />
                                  </span>
                                  <strong>{t("composer.photoVideo")}</strong>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openAttachmentPicker(
                                      DOCUMENT_ATTACHMENT_TYPES,
                                    )
                                  }
                                  disabled={sendingMessage}
                                >
                                  <span className="document">
                                    <AttachmentGlyph name="document" />
                                  </span>
                                  <strong>{t("composer.document")}</strong>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openAttachmentPicker(AUDIO_ATTACHMENT_TYPES)
                                  }
                                  disabled={sendingMessage}
                                >
                                  <span className="audio">
                                    <AttachmentGlyph name="audio" />
                                  </span>
                                  <strong>{t("composer.audio")}</strong>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleShareCurrentLocation();
                                    setAttachmentMenuOpen(false);
                                  }}
                                  disabled={locationActionLoading !== null}
                                >
                                  <span className="location">
                                    <AttachmentGlyph name="location" />
                                  </span>
                                  <strong>{t("composer.location")}</strong>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAttachmentMenuView("LIVE_LOCATION")
                                  }
                                  disabled={
                                    locationActionLoading !== null ||
                                    activeLiveLocation !== null
                                  }
                                >
                                  <span className="live-location">
                                    <AttachmentGlyph name="location" />
                                  </span>
                                  <strong>{t("composer.liveLocation")}</strong>
                                </button>
                              </div>

                              {activeLiveLocation && (
                                <button
                                  type="button"
                                  className="message-live-location-stop"
                                  onClick={() => {
                                    void handleStopLiveLocation();
                                    setAttachmentMenuOpen(false);
                                  }}
                                  disabled={locationActionLoading === "STOP"}
                                >
                                  <span aria-hidden="true">■</span>
                                  {locationActionLoading === "STOP"
                                    ? t("composer.stoppingLiveLocation")
                                    : t("composer.stopLiveLocation")}
                                </button>
                              )}
                            </>
                          ) : (
                            <div className="message-live-location-step">
                              <span
                                className="message-live-location-illustration"
                                aria-hidden="true"
                              >
                                <AttachmentGlyph name="location" />
                              </span>
                              <div>
                                <strong>
                                  {t("composer.shareLivePosition")}
                                </strong>
                                <small>
                                  {t("composer.liveLocationPrivacy")}
                                </small>
                              </div>
                              <div
                                className="message-live-duration-options"
                                role="group"
                                aria-label={t("composer.liveLocationDuration")}
                              >
                                {([15, 60, 480] as const).map((duration) => (
                                  <button
                                    key={duration}
                                    type="button"
                                    className={
                                      locationDurationMinutes === duration
                                        ? "active"
                                        : ""
                                    }
                                    onClick={() =>
                                      setLocationDurationMinutes(duration)
                                    }
                                    aria-pressed={
                                      locationDurationMinutes === duration
                                    }
                                  >
                                    {duration === 15
                                      ? t("composer.duration15Min")
                                      : duration === 60
                                        ? t("composer.duration1Hour")
                                        : t("composer.duration8Hours")}
                                  </button>
                                ))}
                              </div>
                              <button
                                type="button"
                                className="message-live-location-start"
                                onClick={() => {
                                  void handleStartLiveLocation();
                                  setAttachmentMenuOpen(false);
                                  setAttachmentMenuView("ROOT");
                                }}
                                disabled={
                                  locationActionLoading !== null ||
                                  activeLiveLocation !== null
                                }
                              >
                                {locationActionLoading === "LIVE"
                                  ? t("composer.starting")
                                  : t("composer.startSharing")}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div
                      ref={composerEmojiMenuRef}
                      className="message-composer-emoji-wrapper"
                    >
                      <button
                        ref={composerEmojiButtonRef}
                        type="button"
                        className="message-composer-control message-composer-emoji"
                        onClick={() => {
                          setAttachmentMenuOpen(false);
                          setAttachmentMenuView("ROOT");
                          setComposerEmojiOpen((value) => !value);
                        }}
                        aria-expanded={composerEmojiOpen}
                        aria-label={t("composer.openEmojiPicker")}
                        disabled={sendingMessage}
                      >
                        <MessageNavigationIcon name="emoji" />
                      </button>

                      {composerEmojiOpen && (
                        <div
                          className="message-composer-emoji-menu"
                          role="dialog"
                          aria-label={t("composer.quickEmojis")}
                          onKeyDown={(event) =>
                            handleLinearKeyboardNavigation(event, "BOTH")
                          }
                        >
                          <header className="message-composer-popover-header">
                            <span
                              className="message-popover-header-spacer"
                              aria-hidden="true"
                            />
                            <strong>{t("composer.emoji")}</strong>
                            <button
                              type="button"
                              className="message-popover-close"
                              onClick={() => {
                                setComposerEmojiOpen(false);
                                window.requestAnimationFrame(() =>
                                  composerEmojiButtonRef.current?.focus(),
                                );
                              }}
                              aria-label={t("composer.closeEmojiPicker")}
                            >
                              ×
                            </button>
                          </header>
                          <div className="message-composer-emoji-body">
                            {COMPOSER_EMOJI_SECTIONS.map((section) => (
                              <section
                                key={section.labelKey}
                                className="message-composer-emoji-section"
                                aria-label={t(section.labelKey)}
                              >
                                <h4>{t(section.labelKey)}</h4>
                                <div className="message-composer-emoji-grid">
                                  {section.emojis.map((emoji) => (
                                    <button
                                      key={`${section.labelKey}-${emoji}`}
                                      type="button"
                                      onClick={() => insertComposerEmoji(emoji)}
                                      aria-label={t("composer.insertEmoji", {
                                        emoji,
                                      })}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              </section>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <textarea
                      ref={composerRef}
                      value={messageText}
                      onChange={(event) => {
                        const value = event.target.value;
                        setMessageText(value);
                        setComposerCaretIndex(
                          event.target.selectionStart ?? value.length,
                        );
                        setMentionSuggestionsDismissed(false);
                        setActiveMentionSuggestionIndex(0);
                        setSendAttemptFailed(false);

                        if (selectedConversationId) {
                          updateLocalTyping(selectedConversationId, value);
                        }
                      }}
                      onSelect={(event) => {
                        setComposerCaretIndex(
                          event.currentTarget.selectionStart ??
                            messageText.length,
                        );
                        setMentionSuggestionsDismissed(false);
                      }}
                      onBlur={() => stopLocalTyping(selectedConversationId)}
                      onKeyDown={handleComposerKeyDown}
                      placeholder={
                        editingMessage
                          ? t("composer.editPlaceholder")
                          : replyingTo
                            ? t("composer.replyPlaceholder")
                            : t("composer.messagePlaceholder")
                      }
                      maxLength={5000}
                      rows={1}
                      disabled={sendingMessage}
                      aria-label={t("composer.messageText")}
                      aria-autocomplete="list"
                      aria-controls={
                        mentionPanelVisible
                          ? "message-mention-suggestions"
                          : undefined
                      }
                      aria-expanded={mentionPanelVisible}
                      aria-activedescendant={activeMentionOptionId}
                      aria-keyshortcuts="Enter Shift+Enter Escape"
                    />

                    {showVoiceRecordAction && (
                      <button
                        type="button"
                        className="message-composer-control message-voice-record-button"
                        onClick={() => void beginVoiceRecording()}
                        disabled={sendingMessage}
                        aria-label={t("composer.recordVoiceNote")}
                      >
                        <MessageNavigationIcon name="microphone" />
                      </button>
                    )}

                    <button
                      type="submit"
                      className={`message-composer-control message-send-button is-${composerSendState}`}
                      disabled={!composerHasContent || sendingMessage}
                      aria-label={
                        sendingMessage
                          ? t("composer.sendingMessage")
                          : sendAttemptFailed
                            ? t("composer.retrySendingMessage")
                            : editingMessage
                              ? t("composer.saveMessage")
                              : t("composer.sendMessage")
                      }
                      title={
                        sendAttemptFailed
                          ? t("composer.retrySending")
                          : undefined
                      }
                    >
                      {sendingMessage ? (
                        <span
                          className="message-send-spinner"
                          aria-hidden="true"
                        />
                      ) : sendAttemptFailed ? (
                        <span className="message-send-retry" aria-hidden="true">
                          ↻
                        </span>
                      ) : editingMessage ? (
                        <span aria-hidden="true">✓</span>
                      ) : (
                        <MessageNavigationIcon name="send" />
                      )}
                    </button>
                  </div>
                )}

                {messageText.length >= 4500 && (
                  <small
                    className={`message-composer-character-count${
                      remainingMessageCharacters <= 100 ? " limit" : ""
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    {t("composer.charactersRemaining", {
                      count: remainingMessageCharacters,
                    })}
                  </small>
                )}
              </form>
            </>
          )}
        </section>

        {selectedConversation &&
          !announcementMode &&
          !ownProfileMode &&
          !newConversationMode &&
          !createGroupMode &&
          !privateGroupDialogOpen &&
          !groupManagementWorkspaceOpen &&
          detailsPanelOpen &&
          !searchPanelOpen && (
            <aside
              className="message-conversation-details is-open"
              aria-label={
                messageInformation ||
                messageInformationError ||
                messageInformationLoadingId
                  ? t("messageInfo.title")
                  : sharedContentOpen
                    ? t("sharedContent.title")
                    : activeUtilityPanel?.kind === "PROFILE"
                      ? t("profileDetail.title")
                      : t("groupInfo.title")
              }
            >
              {messageInformation ||
              messageInformationError ||
              messageInformationLoadingId
                ? renderMessageInformationPanel()
                : sharedContentOpen
                  ? renderSharedContentPanel()
                  : activeUtilityPanel?.kind === "PROFILE"
                    ? renderConversationProfilePanel()
                    : selectedConversation.type === "GROUP"
                      ? renderGroupInformationPanel()
                      : null}
            </aside>
          )}

        {selectedConversation &&
          !announcementMode &&
          !ownProfileMode &&
          !newConversationMode &&
          !createGroupMode &&
          !privateGroupDialogOpen &&
          !groupManagementWorkspaceOpen &&
          searchPanelOpen && (
            <aside
              className="message-conversation-search-panel is-open"
              aria-label={t("messageSearch.aria")}
            >
              <div className="message-search-panel-header">
                <div>
                  <strong>{t("messageSearch.title")}</strong>
                </div>
                <button
                  type="button"
                  className="message-search-panel-close"
                  onClick={(event) => {
                    event.currentTarget.blur();
                    closeMessageSearchPanel();
                  }}
                  aria-label={t("messageSearch.close")}
                >
                  <span
                    className="message-search-panel-mobile-back-icon"
                    aria-hidden="true"
                  >
                    ←
                  </span>
                  <span
                    className="message-search-panel-close-icon"
                    aria-hidden="true"
                  >
                    <MessageNavigationIcon name="close" />
                  </span>
                </button>
              </div>

              <div className="message-search-panel-controls" role="search">
                <label className="message-search-input-shell">
                  <span className="sr-only">
                    {t("messageSearch.searchConversation")}
                  </span>
                  <MessageNavigationIcon name="search" />
                  <input
                    ref={messageSearchInputRef}
                    type="search"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder={t("messageSearch.placeholder")}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {searchText.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchText("");
                        messageSearchInputRef.current?.focus();
                      }}
                      aria-label={t("messageSearch.clear")}
                    >
                      <MessageNavigationIcon name="close" />
                    </button>
                  )}
                </label>

                {searchResults.length > 0 && !searchLoading && !searchError && (
                  <p className="message-search-result-count" role="status">
                    {t("search.result", { count: searchResults.length })}
                  </p>
                )}
              </div>

              <div className="message-search-panel-results" aria-live="polite">
                {searchLoading ? (
                  <div className="message-search-panel-status">
                    <span
                      className="message-small-spinner"
                      aria-hidden="true"
                    />
                    <span>{t("messageSearch.searching")}</span>
                  </div>
                ) : searchError ? (
                  <div className="message-inline-error compact">
                    <p>{searchError}</p>
                  </div>
                ) : searchText.trim().length ===
                  0 ? null : searchResults.length === 0 ? (
                  <p className="message-search-panel-empty">
                    {t("messageSearch.none")}
                  </p>
                ) : (
                  <div className="message-search-panel-list">
                    {searchResults.map((result) => (
                      <button
                        key={result.message.id}
                        type="button"
                        className="message-search-panel-result"
                        onClick={() => openSearchMessageResult(result)}
                      >
                        {renderAccountAvatar(
                          result.message.sender,
                          "message-avatar small",
                        )}
                        <span className="message-search-panel-result-copy">
                          <span className="message-search-panel-result-heading">
                            <strong>{result.message.sender.displayName}</strong>
                            <time dateTime={result.message.sentAt}>
                              {formatConversationTime(result.message.sentAt)}
                            </time>
                          </span>
                          <span className="message-search-panel-result-snippet">
                            {result.snippet}
                          </span>
                          {result.matchedAttachmentFileName && (
                            <small>{result.matchedAttachmentFileName}</small>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          )}
      </section>

      {announcementDetailOpen && (
        <div className="message-announcement-workspace-layer message-announcement-detail-backdrop">
          <section
            className="message-announcement-detail-dialog message-announcement-workspace-detail"
            role="region"
            aria-labelledby="message-announcement-detail-title"
          >
            <header>
              <div>
                <span>{t("announcementDetail.eyebrow")}</span>
                <h2 id="message-announcement-detail-title">
                  {announcementDetail?.title ??
                    t("announcementDetail.detailsTitle")}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeAnnouncementDetail}
                aria-label={t("announcementDetail.close")}
                disabled={announcementDetailAction !== null}
              >
                ×
              </button>
            </header>

            <div className="message-announcement-detail-body">
              {announcementDetailLoading ? (
                <div className="message-announcement-detail-state">
                  <strong>{t("announcementDetail.loading")}</strong>
                  <span>{t("announcementDetail.loadingDescription")}</span>
                </div>
              ) : announcementDetailError && !announcementDetail ? (
                <div
                  className="message-announcement-detail-state danger"
                  role="alert"
                >
                  <strong>{t("announcementDetail.loadError")}</strong>
                  <span>{announcementDetailError}</span>
                </div>
              ) : announcementDetail ? (
                <>
                  <section className="message-announcement-detail-overview">
                    <div className="message-announcement-detail-summary">
                      <div className="message-announcement-card-badges">
                        <span className="message-announcement-priority">
                          {announcementEnumLabel(
                            announcementDetail.priority,
                            t,
                          )}
                        </span>
                        {announcementDetail.status !== "PUBLISHED" && (
                          <span>
                            {announcementEnumLabel(
                              announcementDetail.status,
                              t,
                            )}
                          </span>
                        )}
                        {announcementDetail.isPinned && (
                          <span>{t("announcementDetail.pinned")}</span>
                        )}
                        {announcementDetail.currentRevision > 1 && (
                          <strong>{t("announcementDetail.edited")}</strong>
                        )}
                      </div>
                      <time
                        dateTime={
                          announcementDetail.publishedAt ??
                          announcementDetail.updatedAt
                        }
                      >
                        {formatAnnouncementDate(
                          announcementDetail.publishedAt ??
                            announcementDetail.updatedAt,
                        )}
                      </time>
                    </div>

                    <div className="message-announcement-detail-publisher">
                      <span aria-hidden="true">
                        {initials(announcementDetail.publisher.displayName)}
                      </span>
                      <div>
                        <small>{t("announcementDetail.publishedBy")}</small>
                        <strong>
                          {announcementDetail.publisher.displayName}
                        </strong>
                        <p>
                          {announcementDetail.publisher.designation ??
                            roleLabel(announcementDetail.publisher.role, t)}
                        </p>
                      </div>
                    </div>
                  </section>

                  <div className="message-announcement-detail-content">
                    <p>
                      {announcementDetail.body ||
                        t("announcementDetail.withdrawn")}
                    </p>
                  </div>

                  <section className="message-announcement-detail-attachments">
                    <header>
                      <div>
                        <strong>{t("announcementDetail.attachments")}</strong>
                        <small>
                          {announcementDetail.attachments.length === 0
                            ? t("announcementDetail.noFiles")
                            : t("announcementDetail.filesHint")}
                        </small>
                      </div>
                      <span>{announcementDetail.attachments.length}</span>
                    </header>

                    {announcementDetail.attachments.length === 0 ? (
                      <p className="message-announcement-detail-empty">
                        {t("announcementDetail.noAttachmentsDescription")}
                      </p>
                    ) : (
                      <ul className="message-announcement-attachment-grid">
                        {announcementDetail.attachments.map((attachment) => {
                          const opening =
                            announcementAttachmentActionId ===
                            `${attachment.id}:open`;
                          const downloading =
                            announcementAttachmentActionId ===
                            `${attachment.id}:download`;
                          const canPreview =
                            canPreviewAnnouncementAttachment(attachment);
                          const canDownload =
                            !attachment.isExpired &&
                            (announcementDetail.allowAttachmentDownload ||
                              announcementDetail.canManage);

                          return (
                            <li
                              key={attachment.id}
                              className={`message-announcement-attachment-card ${attachment.category.toLowerCase()}${
                                attachment.isExpired ? " is-expired" : ""
                              }`}
                            >
                              <span
                                className={`message-announcement-file-kind ${attachment.category.toLowerCase()}`}
                                aria-hidden="true"
                              >
                                {announcementAttachmentShortLabel(
                                  attachment.category,
                                )}
                              </span>
                              <div className="message-announcement-file-copy">
                                <strong>{attachment.originalFileName}</strong>
                                <small>
                                  {announcementEnumLabel(
                                    attachment.category,
                                    t,
                                  )}{" "}
                                  · {formatFileSize(attachment.fileSizeBytes)}
                                </small>
                                {attachment.isExpired && (
                                  <small className="message-announcement-file-expired">
                                    {t("announcementDetail.attachmentExpired")}
                                  </small>
                                )}
                              </div>
                              <div className="message-announcement-file-actions">
                                {canPreview && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleAnnouncementAttachmentOpen(
                                        attachment,
                                      )
                                    }
                                    disabled={
                                      announcementAttachmentActionId !== null
                                    }
                                  >
                                    {opening
                                      ? t("announcementDetail.opening")
                                      : t("announcementDetail.preview")}
                                  </button>
                                )}
                                {canDownload && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleAnnouncementAttachmentDownload(
                                        attachment,
                                      )
                                    }
                                    disabled={
                                      announcementAttachmentActionId !== null
                                    }
                                  >
                                    {downloading
                                      ? t("announcementDetail.downloading")
                                      : t("announcementDetail.download")}
                                  </button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>

                  {announcementDetailError && (
                    <div
                      className="message-announcement-detail-state danger"
                      role="alert"
                    >
                      <strong>{t("announcementDetail.actionFailed")}</strong>
                      <span>{announcementDetailError}</span>
                    </div>
                  )}

                  {announcementDeleteConfirmationOpen && (
                    <section
                      className="message-announcement-delete-confirmation"
                      role="alertdialog"
                      aria-modal="true"
                      aria-labelledby="message-announcement-delete-title"
                      aria-describedby="message-announcement-delete-description"
                      data-message-modal="announcement-delete-confirmation"
                      tabIndex={-1}
                    >
                      <div>
                        <strong id="message-announcement-delete-title">
                          {t("announcementDetail.deleteConfirmTitle")}
                        </strong>
                        <p id="message-announcement-delete-description">
                          {t("announcementDetail.deleteConfirmDescription")}
                        </p>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setAnnouncementDeleteConfirmationOpen(false)
                          }
                          disabled={announcementDetailAction === "DELETE"}
                        >
                          {t("actions.cancel")}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => void handleAnnouncementDelete()}
                          disabled={announcementDetailAction === "DELETE"}
                        >
                          {announcementDetailAction === "DELETE"
                            ? t("announcementDetail.deleting")
                            : t("announcementDetail.deletePermanently")}
                        </button>
                      </div>
                    </section>
                  )}
                </>
              ) : null}
            </div>

            {announcementDetail && !announcementDetailLoading && (
              <footer>
                <div>
                  {announcementDetail.requiresAcknowledgement &&
                    announcementDetail.status === "PUBLISHED" &&
                    announcementDetail.viewerState &&
                    !announcementDetail.viewerState.isAcknowledged && (
                      <button
                        type="button"
                        className="acknowledge"
                        onClick={() => void handleAnnouncementAcknowledgement()}
                        disabled={announcementDetailAction !== null}
                      >
                        {announcementDetailAction === "ACKNOWLEDGE"
                          ? t("announcementDetail.acknowledging")
                          : t("announcementDetail.acknowledge")}
                      </button>
                    )}
                </div>
                <div>
                  {announcementDetail.canEdit &&
                    isAnnouncementEditable(announcementDetail.status) && (
                      <button
                        type="button"
                        onClick={() =>
                          void openAnnouncementEditor(announcementDetail.id)
                        }
                        disabled={announcementDetailAction !== null}
                      >
                        {t("announcementDetail.edit")}
                      </button>
                    )}
                  {announcementDetail.canDelete &&
                    isAnnouncementDeletable(announcementDetail.status) && (
                      <button
                        type="button"
                        className="danger"
                        onClick={() =>
                          setAnnouncementDeleteConfirmationOpen(true)
                        }
                        disabled={announcementDetailAction !== null}
                      >
                        {t("announcementDetail.delete")}
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={closeAnnouncementDetail}
                    disabled={announcementDetailAction !== null}
                  >
                    {t("announcementDetail.closeAction")}
                  </button>
                </div>
              </footer>
            )}
          </section>
        </div>
      )}

      {announcementComposerOpen && announcementComposerGroup && (
        <div className="message-announcement-workspace-layer message-announcement-composer-backdrop">
          <section
            className="message-announcement-composer-dialog message-announcement-workspace-composer"
            role="region"
            aria-labelledby="message-announcement-composer-title"
          >
            <header>
              <div>
                <span>{t("announcementComposer.eyebrow")}</span>
                <h2 id="message-announcement-composer-title">
                  {announcementComposerMode === "EDIT"
                    ? t("announcementComposer.editTitle")
                    : t("announcementComposer.createTitle")}
                </h2>
                <p>{t("announcementComposer.description")}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleAnnouncementComposerCancel()}
                aria-label={t("announcementComposer.close")}
                disabled={announcementComposerSubmitting !== null}
              >
                ×
              </button>
            </header>

            <form
              onSubmit={(event) => void handleAnnouncementComposerSubmit(event)}
            >
              <div className="message-announcement-composer-body">
                <section
                  className="message-announcement-audience-lock"
                  aria-label={t("announcementComposer.audienceAria")}
                >
                  <div>
                    <small>{t("announcementComposer.audience")}</small>
                    {announcementComposerMode === "EDIT" ? (
                      <>
                        <strong>
                          {announcementDetail?.audience.officialGroup?.title ??
                            announcementDetail?.audience.orgUnit?.name ??
                            announcementDetail?.audience.office?.name ??
                            announcementComposerGroup.title ??
                            t("groupInfo.officialGroup")}
                        </strong>
                        <p>
                          {t("announcementComposer.audienceLockedAfterCreate")}
                        </p>
                      </>
                    ) : (
                      <div className="message-announcement-composer-grid">
                        <label>
                          <span>{t("announcementComposer.audienceType")}</span>
                          <select
                            value={announcementComposerValues.audienceType}
                            disabled={announcementAudienceLoading}
                            onChange={(event) =>
                              setAnnouncementComposerValues((current) => ({
                                ...current,
                                audienceType: event.target
                                  .value as AnnouncementCreateAudienceType,
                                orgUnitId: "",
                                includeDescendants: false,
                              }))
                            }
                          >
                            {announcementAudienceOptions?.canTargetOffice && (
                              <option value="OFFICE">
                                {t("announcementComposer.wholeOffice")}
                              </option>
                            )}
                            {(announcementAudienceOptions?.orgUnits.length ??
                              0) > 0 && (
                              <option value="ORG_UNIT">
                                {t("announcementComposer.orgUnit")}
                              </option>
                            )}
                            {(announcementAudienceOptions?.officialGroups
                              .length ?? 0) > 0 && (
                              <option value="OFFICIAL_GROUP">
                                {t("announcementComposer.officialGroup")}
                              </option>
                            )}
                          </select>
                        </label>

                        {announcementComposerValues.audienceType ===
                          "ORG_UNIT" && (
                          <>
                            <label>
                              <span>{t("announcementComposer.orgUnit")}</span>
                              <select
                                value={announcementComposerValues.orgUnitId}
                                onChange={(event) =>
                                  setAnnouncementComposerValues((current) => ({
                                    ...current,
                                    orgUnitId: event.target.value,
                                  }))
                                }
                                required
                              >
                                <option value="">
                                  {t("announcementComposer.selectOrgUnit")}
                                </option>
                                {announcementAudienceOptions?.orgUnits.map(
                                  (unit) => (
                                    <option key={unit.id} value={unit.id}>
                                      {unit.name}
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                            <label>
                              <span>
                                {t("announcementComposer.membershipScope")}
                              </span>
                              <select
                                value={
                                  announcementComposerValues.includeDescendants
                                    ? "SUBTREE"
                                    : "DIRECT"
                                }
                                onChange={(event) =>
                                  setAnnouncementComposerValues((current) => ({
                                    ...current,
                                    includeDescendants:
                                      event.target.value === "SUBTREE",
                                  }))
                                }
                              >
                                <option value="DIRECT">
                                  {t("announcementComposer.directMembers")}
                                </option>
                                <option value="SUBTREE">
                                  {t("announcementComposer.entireSubtree")}
                                </option>
                              </select>
                            </label>
                          </>
                        )}

                        {announcementComposerValues.audienceType ===
                          "OFFICIAL_GROUP" && (
                          <label>
                            <span>
                              {t("announcementComposer.officialGroup")}
                            </span>
                            <select
                              value={
                                announcementComposerValues.officialConversationId
                              }
                              onChange={(event) =>
                                setAnnouncementComposerValues((current) => ({
                                  ...current,
                                  officialConversationId: event.target.value,
                                }))
                              }
                              required
                            >
                              <option value="">
                                {t("announcementComposer.selectOfficialGroup")}
                              </option>
                              {announcementAudienceOptions?.officialGroups.map(
                                (group) => (
                                  <option key={group.id} value={group.id}>
                                    {group.title}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                  {announcementComposerMode === "EDIT" && (
                    <em>{t("announcementComposer.locked")}</em>
                  )}
                </section>

                <div className="message-announcement-composer-layout">
                  <div className="message-announcement-composer-main">
                    <section className="message-announcement-composer-section">
                      <header>
                        <div>
                          <strong>{t("announcementComposer.content")}</strong>
                          <small>{t("announcementComposer.contentHint")}</small>
                        </div>
                      </header>

                      <div className="message-announcement-composer-grid content-grid">
                        <label className="full-width">
                          <span>{t("announcementComposer.titleLabel")}</span>
                          <input
                            type="text"
                            value={announcementComposerValues.title}
                            onChange={(event) =>
                              setAnnouncementComposerValues((current) => ({
                                ...current,
                                title: event.target.value,
                              }))
                            }
                            maxLength={160}
                            placeholder={t(
                              "announcementComposer.titlePlaceholder",
                            )}
                            autoFocus
                            required
                          />
                          <small>
                            {announcementComposerValues.title.length}/160
                          </small>
                        </label>

                        <label className="full-width">
                          <span>{t("announcementComposer.messageLabel")}</span>
                          <textarea
                            value={announcementComposerValues.body}
                            onChange={(event) =>
                              setAnnouncementComposerValues((current) => ({
                                ...current,
                                body: event.target.value,
                              }))
                            }
                            maxLength={5000}
                            rows={8}
                            placeholder={t(
                              "announcementComposer.messagePlaceholder",
                            )}
                            required
                          />
                          <small>
                            {announcementComposerValues.body.length}/5000
                          </small>
                        </label>
                      </div>
                    </section>

                    <section className="message-announcement-composer-attachments message-announcement-composer-section">
                      <header>
                        <div>
                          <strong>{t("announcementDetail.attachments")}</strong>
                          <small>
                            {t("announcementComposer.attachmentsHint")}
                          </small>
                        </div>
                        <span>
                          {announcementComposerExistingAttachments.length +
                            announcementComposerPendingAttachments.length -
                            announcementComposerRemovedAttachmentIds.length}
                        </span>
                      </header>

                      <div className="message-announcement-attachment-pickers">
                        <label>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            disabled={announcementComposerSubmitting !== null}
                            onChange={(event) =>
                              handleAnnouncementAttachmentSelection(
                                event,
                                "IMAGE",
                              )
                            }
                          />
                          <span aria-hidden="true">IMG</span>
                          <strong>{t("announcementComposer.addImages")}</strong>
                          <small>JPG, PNG, WEBP · 20 MB</small>
                        </label>
                        <label>
                          <input
                            type="file"
                            accept="video/mp4,video/webm"
                            multiple
                            disabled={announcementComposerSubmitting !== null}
                            onChange={(event) =>
                              handleAnnouncementAttachmentSelection(
                                event,
                                "VIDEO",
                              )
                            }
                          />
                          <span aria-hidden="true">VID</span>
                          <strong>{t("announcementComposer.addVideos")}</strong>
                          <small>MP4, WEBM · 200 MB</small>
                        </label>
                        <label>
                          <input
                            type="file"
                            accept=".pdf,.docx,.xlsx,.pptx,.txt,.csv,.zip,application/pdf,text/plain,text/csv,application/zip"
                            multiple
                            disabled={announcementComposerSubmitting !== null}
                            onChange={(event) =>
                              handleAnnouncementAttachmentSelection(
                                event,
                                "DOCUMENT",
                              )
                            }
                          />
                          <span aria-hidden="true">DOC</span>
                          <strong>{t("announcementComposer.addFiles")}</strong>
                          <small>PDF, Office, text, CSV, ZIP · 50 MB</small>
                        </label>
                      </div>

                      {announcementComposerExistingAttachments.length === 0 &&
                      announcementComposerPendingAttachments.length === 0 ? (
                        <p className="message-announcement-attachment-empty">
                          {t("announcementComposer.noAttachmentsSelected")}
                        </p>
                      ) : (
                        <ul className="message-announcement-composer-file-list">
                          {announcementComposerExistingAttachments.map(
                            (attachment) => {
                              const removed =
                                announcementComposerRemovedAttachmentIds.includes(
                                  attachment.id,
                                );
                              return (
                                <li
                                  key={attachment.id}
                                  className={removed ? "removed" : ""}
                                >
                                  <span
                                    className={`message-announcement-file-kind ${attachment.category.toLowerCase()}`}
                                    aria-hidden="true"
                                  >
                                    {announcementAttachmentShortLabel(
                                      attachment.category,
                                    )}
                                  </span>
                                  <div className="message-announcement-file-copy">
                                    <strong>
                                      {attachment.originalFileName}
                                    </strong>
                                    <small>
                                      {t("announcementComposer.existing")}{" "}
                                      {announcementEnumLabel(
                                        attachment.category,
                                        t,
                                      )}{" "}
                                      ·{" "}
                                      {formatFileSize(attachment.fileSizeBytes)}
                                    </small>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={
                                      announcementComposerSubmitting !== null
                                    }
                                    onClick={() =>
                                      setAnnouncementComposerRemovedAttachmentIds(
                                        (current) =>
                                          current.includes(attachment.id)
                                            ? current.filter(
                                                (id) => id !== attachment.id,
                                              )
                                            : [...current, attachment.id],
                                      )
                                    }
                                  >
                                    {removed
                                      ? t("announcementComposer.undo")
                                      : t("announcementComposer.remove")}
                                  </button>
                                </li>
                              );
                            },
                          )}

                          {announcementComposerPendingAttachments.map(
                            (attachment) => (
                              <li
                                key={attachment.clientId}
                                className={
                                  attachment.status === "ERROR" ? "failed" : ""
                                }
                              >
                                <span
                                  className={`message-announcement-file-kind ${attachment.category.toLowerCase()}`}
                                  aria-hidden="true"
                                >
                                  {announcementAttachmentShortLabel(
                                    attachment.category,
                                  )}
                                </span>
                                <div className="message-announcement-file-copy">
                                  <strong>{attachment.file.name}</strong>
                                  <small>
                                    {attachment.status === "UPLOADING"
                                      ? t(
                                          "announcementComposer.uploadingProgress",
                                          {
                                            percent: attachment.progressPercent,
                                          },
                                        )
                                      : attachment.status === "UPLOADED"
                                        ? t("announcementComposer.uploaded")
                                        : attachment.status === "REMOVING"
                                          ? t("announcementComposer.removing")
                                          : (attachment.error ??
                                            `${announcementEnumLabel(attachment.category, t)} · ${formatFileSize(attachment.file.size)}`)}
                                  </small>
                                  {attachment.status === "UPLOADING" && (
                                    <span
                                      className="message-announcement-upload-progress"
                                      aria-hidden="true"
                                    >
                                      <i
                                        style={{
                                          width: `${attachment.progressPercent}%`,
                                        }}
                                      />
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  disabled={
                                    announcementComposerSubmitting !== null ||
                                    attachment.status === "UPLOADING" ||
                                    attachment.status === "REMOVING"
                                  }
                                  onClick={() =>
                                    void removePendingAnnouncementAttachment(
                                      attachment.clientId,
                                    )
                                  }
                                >
                                  {t("announcementComposer.remove")}
                                </button>
                              </li>
                            ),
                          )}
                        </ul>
                      )}
                    </section>
                  </div>

                  <aside className="message-announcement-composer-side">
                    <section className="message-announcement-composer-section">
                      <header>
                        <div>
                          <strong>
                            {t("announcementComposer.publishing")}
                          </strong>
                          <small>
                            {t("announcementComposer.publishingHint")}
                          </small>
                        </div>
                      </header>

                      <div className="message-announcement-composer-grid publishing-grid">
                        <label>
                          <span>{t("announcementComposer.priority")}</span>
                          <select
                            value={announcementComposerValues.priority}
                            onChange={(event) =>
                              setAnnouncementComposerValues((current) => ({
                                ...current,
                                priority: event.target
                                  .value as AnnouncementPriority,
                              }))
                            }
                          >
                            <option value="NORMAL">
                              {t("announcement.enums.normal", {
                                ns: "messaging",
                              })}
                            </option>
                            <option value="IMPORTANT">
                              {t("announcement.enums.important", {
                                ns: "messaging",
                              })}
                            </option>
                            <option value="URGENT">
                              {t("announcement.enums.urgent", {
                                ns: "messaging",
                              })}
                            </option>
                            <option value="EMERGENCY">
                              {t("announcement.enums.emergency", {
                                ns: "messaging",
                              })}
                            </option>
                          </select>
                        </label>

                        <label>
                          <span>{t("announcementComposer.publish")}</span>
                          <select
                            value={announcementComposerValues.publishTiming}
                            disabled={
                              announcementComposerStatus === "PUBLISHED"
                            }
                            onChange={(event) =>
                              setAnnouncementComposerValues((current) => ({
                                ...current,
                                publishTiming: event.target
                                  .value as AnnouncementPublishTiming,
                              }))
                            }
                          >
                            <option value="NOW">
                              {t("announcementComposer.now")}
                            </option>
                            <option value="SCHEDULE">
                              {t("announcementComposer.schedule")}
                            </option>
                          </select>
                        </label>

                        {announcementComposerStatus !== "PUBLISHED" &&
                          announcementComposerValues.publishTiming ===
                            "SCHEDULE" && (
                            <label>
                              <span>
                                {t("announcementComposer.scheduledAt")}
                              </span>
                              <input
                                type="datetime-local"
                                value={announcementComposerValues.scheduledAt}
                                min={toLocalDateTimeInputValue(
                                  new Date(currentTime + 60_000),
                                )}
                                onChange={(event) =>
                                  setAnnouncementComposerValues((current) => ({
                                    ...current,
                                    scheduledAt: event.target.value,
                                  }))
                                }
                                required
                              />
                            </label>
                          )}

                        <label>
                          <span>{t("announcementComposer.expiry")}</span>
                          <input
                            type="datetime-local"
                            value={announcementComposerValues.expiresAt}
                            min={
                              announcementComposerValues.publishTiming ===
                                "SCHEDULE" &&
                              announcementComposerValues.scheduledAt
                                ? announcementComposerValues.scheduledAt
                                : toLocalDateTimeInputValue(
                                    new Date(currentTime + 60_000),
                                  )
                            }
                            onChange={(event) =>
                              setAnnouncementComposerValues((current) => ({
                                ...current,
                                expiresAt: event.target.value,
                              }))
                            }
                          />
                          <small>{t("announcementComposer.optional")}</small>
                        </label>
                      </div>
                    </section>

                    <section className="message-announcement-composer-section">
                      <header>
                        <div>
                          <strong>
                            {t("announcementComposer.deliveryOptions")}
                          </strong>
                          <small>
                            {t("announcementComposer.deliveryHint")}
                          </small>
                        </div>
                      </header>

                      <div className="message-announcement-composer-options">
                        <label>
                          <input
                            type="checkbox"
                            checked={
                              announcementComposerValues.requiresAcknowledgement
                            }
                            onChange={(event) =>
                              setAnnouncementComposerValues((current) => ({
                                ...current,
                                requiresAcknowledgement: event.target.checked,
                                isPinned: event.target.checked
                                  ? true
                                  : current.isPinned,
                              }))
                            }
                          />
                          <span>
                            <strong>
                              {t("announcementComposer.requireAcknowledgement")}
                            </strong>
                            <small>
                              {t(
                                "announcementComposer.requireAcknowledgementHint",
                              )}
                            </small>
                          </span>
                        </label>

                        <label>
                          <input
                            type="checkbox"
                            checked={announcementComposerValues.isPinned}
                            disabled={
                              announcementComposerValues.requiresAcknowledgement
                            }
                            onChange={(event) =>
                              setAnnouncementComposerValues((current) => ({
                                ...current,
                                isPinned: event.target.checked,
                              }))
                            }
                          />
                          <span>
                            <strong>{t("announcementComposer.pin")}</strong>
                            <small>{t("announcementComposer.pinHint")}</small>
                          </span>
                        </label>

                        <label>
                          <input
                            type="checkbox"
                            checked={
                              announcementComposerValues.allowAttachmentDownload
                            }
                            onChange={(event) =>
                              setAnnouncementComposerValues((current) => ({
                                ...current,
                                allowAttachmentDownload: event.target.checked,
                              }))
                            }
                          />
                          <span>
                            <strong>
                              {t("announcementComposer.allowDownloads")}
                            </strong>
                            <small>
                              {t("announcementComposer.allowDownloadsHint")}
                            </small>
                          </span>
                        </label>
                      </div>
                    </section>
                  </aside>
                </div>

                {announcementComposerError && (
                  <div
                    className="message-announcement-composer-error"
                    role="alert"
                  >
                    <strong>
                      {announcementComposerMode === "EDIT"
                        ? t("announcementComposer.updateError")
                        : t("announcementComposer.sendError")}
                    </strong>
                    <span>{announcementComposerError}</span>
                  </div>
                )}
              </div>

              <footer>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void handleAnnouncementComposerCancel()}
                  disabled={announcementComposerSubmitting !== null}
                >
                  {announcementComposerSubmitting === "CANCEL"
                    ? t("announcementComposer.cancelling")
                    : t("announcementComposer.cancel")}
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={announcementComposerSubmitting !== null}
                >
                  {announcementComposerSubmitting === "PUBLISH" ||
                  announcementComposerSubmitting === "SAVE"
                    ? t("announcementComposer.processing")
                    : announcementComposerMode === "EDIT"
                      ? t("announcementComposer.saveChanges")
                      : announcementComposerValues.publishTiming === "SCHEDULE"
                        ? t("announcementComposer.scheduleAnnouncement")
                        : t("announcementComposer.publishAnnouncement")}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {destructiveConfirmation && destructiveConfirmationContent && (
        <div
          className="message-dialog-backdrop message-conversation-history-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeDestructiveConfirmation();
            }
          }}
        >
          <section
            className="message-conversation-history-dialog destructive"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="message-destructive-confirmation-title"
            aria-describedby="message-destructive-confirmation-description"
            data-message-modal="destructive-confirmation"
            tabIndex={-1}
          >
            <div
              className="message-conversation-history-icon"
              aria-hidden="true"
            >
              <MessageNavigationIcon
                name={
                  destructiveConfirmation.kind === "DELETE_MESSAGE_FOR_ME" ||
                  destructiveConfirmation.kind === "DELETE_MESSAGE_FOR_EVERYONE"
                    ? "trash"
                    : "close"
                }
              />
            </div>

            <div className="message-conversation-history-copy">
              <span>{destructiveConfirmationContent.eyebrow}</span>
              <h2 id="message-destructive-confirmation-title">
                {destructiveConfirmationContent.title}
              </h2>
              <p id="message-destructive-confirmation-description">
                {destructiveConfirmationContent.description}
              </p>
            </div>

            <section className="message-conversation-history-scope">
              <strong>{t("confirmation.common.beforeContinue")}</strong>
              <ul>
                {destructiveConfirmationContent.consequences.map(
                  (consequence) => (
                    <li key={consequence}>{consequence}</li>
                  ),
                )}
              </ul>
            </section>

            {destructiveConfirmationError && (
              <div className="message-conversation-history-error" role="alert">
                <strong>{t("confirmation.common.actionFailed")}</strong>
                <span>{destructiveConfirmationError}</span>
              </div>
            )}

            <footer>
              <button
                type="button"
                className="secondary"
                onClick={closeDestructiveConfirmation}
                disabled={destructiveConfirmationSubmitting}
                data-message-modal-initial-focus="true"
              >
                {t("confirmation.common.cancel")}
              </button>
              <button
                type="button"
                className="danger"
                onClick={submitDestructiveConfirmation}
                disabled={destructiveConfirmationSubmitting}
              >
                {destructiveConfirmationSubmitting
                  ? t("confirmation.common.applying")
                  : destructiveConfirmationContent.confirmLabel}
              </button>
            </footer>
          </section>
        </div>
      )}

      {conversationHistoryAction && conversationHistoryTarget && (
        <div
          className="message-dialog-backdrop message-conversation-history-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeConversationHistoryConfirmation();
            }
          }}
        >
          <section
            ref={conversationHistoryDialogRef}
            className={`message-conversation-history-dialog${
              conversationHistoryAction === "DELETE" ? " destructive" : ""
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-conversation-history-title"
            aria-describedby="message-conversation-history-description"
          >
            <div
              className="message-conversation-history-icon"
              aria-hidden="true"
            >
              <MessageNavigationIcon
                name={
                  conversationHistoryAction === "DELETE" ? "trash" : "close"
                }
              />
            </div>

            <div className="message-conversation-history-copy">
              <span>{t("historyConfirmation.eyebrow")}</span>
              <h2 id="message-conversation-history-title">
                {conversationHistoryAction === "DELETE"
                  ? t("historyConfirmation.deleteTitle")
                  : t("historyConfirmation.clearTitle")}
              </h2>
              <p id="message-conversation-history-description">
                {conversationHistoryAction === "DELETE"
                  ? t("historyConfirmation.deleteDescription")
                  : t("historyConfirmation.clearDescription")}
              </p>
            </div>

            <section className="message-conversation-history-scope">
              <strong>{t("historyConfirmation.unchangedTitle")}</strong>
              <ul>
                <li>{t("historyConfirmation.unchanged1")}</li>
                <li>{t("historyConfirmation.unchanged2")}</li>
                <li>{t("historyConfirmation.unchanged3")}</li>
              </ul>
            </section>

            {conversationHistoryError && (
              <div className="message-conversation-history-error" role="alert">
                <strong>{t("confirmation.common.actionFailed")}</strong>
                <span>{conversationHistoryError}</span>
              </div>
            )}

            <footer>
              <button
                ref={conversationHistoryCancelRef}
                type="button"
                className="secondary"
                onClick={closeConversationHistoryConfirmation}
                disabled={conversationHistorySubmitting}
              >
                {t("confirmation.common.cancel")}
              </button>
              <button
                type="button"
                className={
                  conversationHistoryAction === "DELETE" ? "danger" : "primary"
                }
                onClick={() => void handlePersonalConversationHistoryAction()}
                disabled={conversationHistorySubmitting}
              >
                {conversationHistorySubmitting
                  ? t("confirmation.common.applying")
                  : conversationHistoryAction === "DELETE"
                    ? t("thread.header.deleteChat")
                    : t("thread.header.clearChat")}
              </button>
            </footer>
          </section>
        </div>
      )}

      {pinnedMessageBrowserOpen && selectedConversation && (
        <div className="message-dialog-backdrop" role="presentation">
          <section
            className="message-pinned-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-pinned-dialog-title"
            data-message-modal="pinned-messages"
            tabIndex={-1}
          >
            <header>
              <div>
                <span>{t("pinnedBrowser.title")}</span>
                <h2 id="message-pinned-dialog-title">
                  {selectedConversation.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={closePinnedMessageBrowser}
                aria-label={t("pinnedBrowser.close")}
              >
                ×
              </button>
            </header>

            <div className="message-pinned-dialog-list">
              {visiblePinnedMessages.map((message, index) => (
                <button
                  key={message.id}
                  type="button"
                  className={
                    index === normalizedPinnedMessageIndex
                      ? "active"
                      : undefined
                  }
                  onClick={() => {
                    setActivePinnedMessageIndex(index);
                    focusPinnedMessage(message);
                  }}
                >
                  <span
                    className="message-pinned-dialog-icon"
                    aria-hidden="true"
                  >
                    📌
                  </span>
                  <span className="message-pinned-dialog-copy">
                    <strong>{message.sender.displayName}</strong>
                    <span>{localizedAttachmentLabel(message)}</span>
                    <small>{formatConversationTime(message.sentAt)}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {forwardingMessage && (
        <div
          className="message-contact-backdrop message-forward-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeForwardDialog();
            }
          }}
        >
          <section
            className="message-contact-dialog message-forward-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="forward-message-title"
            data-message-modal="forward"
            tabIndex={-1}
          >
            <header className="message-forward-header">
              <div>
                <h2 id="forward-message-title">{t("forward.title")}</h2>
                <p>{t("forward.chooseChats")}</p>
              </div>

              <button
                type="button"
                onClick={closeForwardDialog}
                disabled={forwardSubmitting}
                aria-label={t("forward.close")}
              >
                ×
              </button>
            </header>

            <div className="message-forward-source">
              <span>{t("forward.forwardingLabel")}</span>
              <strong>{localizedAttachmentLabel(forwardingMessage)}</strong>
            </div>

            <div className="message-forward-search">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                type="search"
                value={forwardSearch}
                onChange={(event) => setForwardSearch(event.target.value)}
                placeholder={t("search.chats")}
                aria-label={t("forward.searchAria")}
                autoFocus
              />
            </div>

            <div className="message-forward-list">
              {listMode && listCandidatesLoading ? (
                <div className="message-list-state compact" role="status">
                  <span className="message-small-spinner" aria-hidden="true" />
                  <h3>{t("forward.loadingConversations")}</h3>
                  <p>{t("forward.loadingDescription")}</p>
                </div>
              ) : listMode && forwardDestinationError ? (
                <div className="message-list-state compact" role="alert">
                  <div className="message-empty-icon" aria-hidden="true">
                    !
                  </div>
                  <h3>{t("forward.loadError")}</h3>
                  <p>{forwardDestinationError}</p>
                  <button
                    type="button"
                    onClick={() =>
                      void loadListCandidateConversations("forward")
                    }
                  >
                    {t("actions.retry")}
                  </button>
                </div>
              ) : filteredForwardConversations.length === 0 ? (
                <div className="message-list-state compact">
                  <div className="message-empty-icon">?</div>
                  <h3>{t("forward.none")}</h3>
                  <p>{t("forward.noneDescription")}</p>
                </div>
              ) : (
                filteredForwardConversations.map((conversation) => {
                  const selected = forwardDestinationIds.includes(
                    conversation.id,
                  );

                  return (
                    <label
                      key={conversation.id}
                      className={`message-forward-row${
                        selected ? " selected" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          toggleForwardDestination(conversation.id)
                        }
                        disabled={
                          forwardSubmitting ||
                          (!selected && forwardDestinationIds.length >= 20)
                        }
                      />

                      {renderConversationAvatar(
                        conversation,
                        "message-avatar small",
                      )}

                      <span>
                        <strong>
                          {conversation.title ??
                            t("forward.privateConversation")}
                        </strong>
                        <small>
                          {conversation.type === "PRIVATE"
                            ? t("forward.privateChat")
                            : conversation.groupKind === "OFFICIAL"
                              ? t("forward.officialGroup")
                              : t("forward.group")}
                        </small>
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <footer className="message-forward-footer">
              <span>
                {t("forward.selected", { count: forwardDestinationIds.length })}
              </span>
              <div>
                <button
                  type="button"
                  onClick={closeForwardDialog}
                  disabled={forwardSubmitting}
                >
                  {t("forward.cancel")}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void handleForwardMessage()}
                  disabled={
                    forwardSubmitting || forwardDestinationIds.length === 0
                  }
                >
                  {forwardSubmitting
                    ? t("forward.forwarding")
                    : t("forward.title")}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {attachmentViewer && (
        <div
          className="message-media-viewer-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeAttachmentViewer();
            }
          }}
        >
          <section
            ref={attachmentViewerDialogRef}
            className={`message-media-viewer${
              isPdfAttachment(attachmentViewer.attachment) ||
              isTextPreviewAttachment(attachmentViewer.attachment)
                ? " document-viewer"
                : ""
            }${attachmentViewerShowsFooter ? " with-footer" : " without-footer"}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-media-viewer-title"
            aria-busy={attachmentViewer.loading}
            tabIndex={-1}
          >
            <header className="message-media-viewer-header">
              <div className="message-media-viewer-identity">
                {renderAccountAvatar(
                  attachmentViewer.message.sender,
                  "message-avatar small",
                )}
                <div>
                  <strong>{attachmentViewer.message.sender.displayName}</strong>
                  <span id="message-media-viewer-title">
                    {notificationTimestampLabel(
                      attachmentViewer.message.sentAt,
                    )}{" "}
                    · {attachmentViewer.attachment.originalFileName}
                  </span>
                </div>
              </div>

              <div className="message-media-viewer-actions">
                <button
                  type="button"
                  onClick={() =>
                    void handleDownloadAttachment(
                      attachmentViewer.message,
                      attachmentViewer.attachment,
                    )
                  }
                  aria-label={t("attachment.downloadNamed", {
                    name: attachmentViewer.attachment.originalFileName,
                  })}
                >
                  <AttachmentGlyph name="download" />
                  <span>{t("attachment.download")}</span>
                </button>
                <button
                  type="button"
                  className="close"
                  data-message-media-viewer-close="true"
                  onClick={closeAttachmentViewer}
                  aria-label={t("attachment.closePreview")}
                >
                  ×
                </button>
              </div>
            </header>

            <div
              className={`message-media-viewer-body ${
                isImageAttachment(attachmentViewer.attachment)
                  ? "is-image"
                  : isVideoAttachment(attachmentViewer.attachment)
                    ? "is-video"
                    : isAudioAttachment(attachmentViewer.attachment)
                      ? "is-audio"
                      : isPdfAttachment(attachmentViewer.attachment)
                        ? "is-pdf"
                        : isTextPreviewAttachment(attachmentViewer.attachment)
                          ? "is-text"
                          : ""
              }`}
            >
              {attachmentViewerIndex > 0 && (
                <button
                  type="button"
                  className="message-media-viewer-navigation previous"
                  onClick={() =>
                    void handlePreviewAttachment(
                      attachmentViewer.message,
                      attachmentViewerItems[attachmentViewerIndex - 1],
                    )
                  }
                  aria-label={t("attachment.previous")}
                >
                  ‹
                </button>
              )}

              {attachmentViewer.loading && (
                <div
                  className="message-media-viewer-state"
                  role="status"
                  aria-live="polite"
                >
                  <span className="message-small-spinner" aria-hidden="true" />
                  <p>{t("attachment.loadingPreview")}</p>
                </div>
              )}

              {!attachmentViewer.loading && attachmentViewer.error && (
                <div className="message-media-viewer-state error" role="alert">
                  <AttachmentGlyph name="retry" />
                  <strong>{t("attachment.previewUnavailable")}</strong>
                  <p>{attachmentViewer.error}</p>
                </div>
              )}

              {!attachmentViewer.loading &&
                !attachmentViewer.error &&
                attachmentViewer.objectUrl &&
                isImageAttachment(attachmentViewer.attachment) && (
                  <img
                    src={attachmentViewer.objectUrl}
                    alt={attachmentViewer.attachment.originalFileName}
                  />
                )}

              {!attachmentViewer.loading &&
                !attachmentViewer.error &&
                attachmentViewer.objectUrl &&
                isVideoAttachment(attachmentViewer.attachment) && (
                  <video src={attachmentViewer.objectUrl} controls playsInline>
                    {t("announcementAttachment.browserVideoUnsupported")}
                  </video>
                )}

              {!attachmentViewer.loading &&
                !attachmentViewer.error &&
                attachmentViewer.objectUrl &&
                isAudioAttachment(attachmentViewer.attachment) && (
                  <div className="message-media-viewer-audio">
                    <CompactAttachmentAudio
                      src={attachmentViewer.objectUrl}
                      voiceNote={
                        getMessagePayloadValue(
                          attachmentViewer.message,
                          "attachmentKind",
                        ) === "VOICE_NOTE"
                      }
                      senderDisplayName={
                        attachmentViewer.message.sender.displayName
                      }
                      senderPhotoUrl={
                        profilePhotoUrls[
                          attachmentViewer.message.sender.accountId
                        ] ?? null
                      }
                    />
                  </div>
                )}

              {!attachmentViewer.loading &&
                !attachmentViewer.error &&
                attachmentViewer.objectUrl &&
                (isPdfAttachment(attachmentViewer.attachment) ||
                  isTextPreviewAttachment(attachmentViewer.attachment)) && (
                  <iframe
                    title={attachmentViewer.attachment.originalFileName}
                    src={attachmentViewer.objectUrl}
                  />
                )}

              {attachmentViewerIndex >= 0 &&
                attachmentViewerIndex < attachmentViewerItems.length - 1 && (
                  <button
                    type="button"
                    className="message-media-viewer-navigation next"
                    onClick={() =>
                      void handlePreviewAttachment(
                        attachmentViewer.message,
                        attachmentViewerItems[attachmentViewerIndex + 1],
                      )
                    }
                    aria-label={t("attachment.next")}
                  >
                    ›
                  </button>
                )}
            </div>

            {attachmentViewerShowsFooter && (
              <footer className="message-media-viewer-footer">
                <div>
                  <strong>
                    {attachmentViewer.attachment.originalFileName}
                  </strong>
                  <span>
                    {t(
                      attachmentTypeTranslationKey(attachmentViewer.attachment),
                    )}{" "}
                    ·{" "}
                    {formatFileSize(attachmentViewer.attachment.fileSizeBytes)}
                  </span>
                </div>
                {attachmentViewerItems.length > 1 &&
                  attachmentViewerIndex >= 0 && (
                    <span>
                      {attachmentViewerIndex + 1} /{" "}
                      {attachmentViewerItems.length}
                    </span>
                  )}
              </footer>
            )}
          </section>
        </div>
      )}

      {announcementAttachmentViewer && (
        <div
          className="message-media-viewer-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeAnnouncementAttachmentViewer();
            }
          }}
        >
          <section
            className={`message-media-viewer${
              isAnnouncementPdfAttachment(
                announcementAttachmentViewer.attachment,
              ) ||
              isAnnouncementTextAttachment(
                announcementAttachmentViewer.attachment,
              )
                ? " document-viewer"
                : ""
            }${
              announcementAttachmentViewerShowsFooter
                ? " with-footer"
                : " without-footer"
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="announcement-attachment-viewer-title"
            aria-busy={announcementAttachmentViewer.loading}
            data-message-modal="announcement-attachment-viewer"
            tabIndex={-1}
          >
            <header className="message-media-viewer-header">
              <div className="message-media-viewer-identity">
                <span className="message-avatar small" aria-hidden="true">
                  {initials(
                    announcementAttachmentViewer.announcement.publisher
                      .displayName,
                  )}
                </span>
                <div>
                  <strong>
                    {
                      announcementAttachmentViewer.announcement.publisher
                        .displayName
                    }
                  </strong>
                  <span id="announcement-attachment-viewer-title">
                    {t("announcementAttachment.viewerTitle", {
                      name: announcementAttachmentViewer.attachment
                        .originalFileName,
                    })}
                  </span>
                </div>
              </div>

              <div className="message-media-viewer-actions">
                {(announcementAttachmentViewer.announcement
                  .allowAttachmentDownload ||
                  announcementAttachmentViewer.announcement.canManage) && (
                  <button
                    type="button"
                    onClick={() =>
                      void handleAnnouncementAttachmentDownload(
                        announcementAttachmentViewer.attachment,
                      )
                    }
                    aria-label={`Download ${announcementAttachmentViewer.attachment.originalFileName}`}
                  >
                    <AttachmentGlyph name="download" />
                    <span>{t("attachment.download")}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="close"
                  data-message-modal-initial-focus="true"
                  onClick={closeAnnouncementAttachmentViewer}
                  aria-label={t("announcementAttachment.close")}
                >
                  ×
                </button>
              </div>
            </header>

            <div
              className={`message-media-viewer-body ${
                isAnnouncementImageAttachment(
                  announcementAttachmentViewer.attachment,
                )
                  ? "is-image"
                  : isAnnouncementVideoAttachment(
                        announcementAttachmentViewer.attachment,
                      )
                    ? "is-video"
                    : isAnnouncementPdfAttachment(
                          announcementAttachmentViewer.attachment,
                        )
                      ? "is-pdf"
                      : isAnnouncementTextAttachment(
                            announcementAttachmentViewer.attachment,
                          )
                        ? "is-text"
                        : ""
              }`}
            >
              {announcementAttachmentViewerIndex > 0 && (
                <button
                  type="button"
                  className="message-media-viewer-navigation previous"
                  onClick={() =>
                    void handleAnnouncementAttachmentOpen(
                      announcementAttachmentViewerItems[
                        announcementAttachmentViewerIndex - 1
                      ],
                    )
                  }
                  aria-label={t("announcementAttachment.previous")}
                >
                  ‹
                </button>
              )}

              {announcementAttachmentViewer.loading && (
                <div
                  className="message-media-viewer-state"
                  role="status"
                  aria-live="polite"
                >
                  <span className="message-small-spinner" aria-hidden="true" />
                  <p>{t("announcementAttachment.loading")}</p>
                </div>
              )}

              {!announcementAttachmentViewer.loading &&
                announcementAttachmentViewer.error && (
                  <div
                    className="message-media-viewer-state error"
                    role="alert"
                  >
                    <AttachmentGlyph name="retry" />
                    <strong>{t("announcementAttachment.unavailable")}</strong>
                    <p>{announcementAttachmentViewer.error}</p>
                  </div>
                )}

              {!announcementAttachmentViewer.loading &&
                !announcementAttachmentViewer.error &&
                announcementAttachmentViewer.objectUrl &&
                isAnnouncementImageAttachment(
                  announcementAttachmentViewer.attachment,
                ) && (
                  <img
                    src={announcementAttachmentViewer.objectUrl}
                    alt={
                      announcementAttachmentViewer.attachment.originalFileName
                    }
                  />
                )}

              {!announcementAttachmentViewer.loading &&
                !announcementAttachmentViewer.error &&
                announcementAttachmentViewer.objectUrl &&
                isAnnouncementVideoAttachment(
                  announcementAttachmentViewer.attachment,
                ) && (
                  <video
                    src={announcementAttachmentViewer.objectUrl}
                    controls
                    playsInline
                  >
                    {t("announcementAttachment.browserVideoUnsupported")}
                  </video>
                )}

              {!announcementAttachmentViewer.loading &&
                !announcementAttachmentViewer.error &&
                announcementAttachmentViewer.objectUrl &&
                (isAnnouncementPdfAttachment(
                  announcementAttachmentViewer.attachment,
                ) ||
                  isAnnouncementTextAttachment(
                    announcementAttachmentViewer.attachment,
                  )) && (
                  <iframe
                    title={
                      announcementAttachmentViewer.attachment.originalFileName
                    }
                    src={announcementAttachmentViewer.objectUrl}
                  />
                )}

              {announcementAttachmentViewerIndex >= 0 &&
                announcementAttachmentViewerIndex <
                  announcementAttachmentViewerItems.length - 1 && (
                  <button
                    type="button"
                    className="message-media-viewer-navigation next"
                    onClick={() =>
                      void handleAnnouncementAttachmentOpen(
                        announcementAttachmentViewerItems[
                          announcementAttachmentViewerIndex + 1
                        ],
                      )
                    }
                    aria-label={t("announcementAttachment.next")}
                  >
                    ›
                  </button>
                )}
            </div>

            {announcementAttachmentViewerShowsFooter && (
              <footer className="message-media-viewer-footer">
                <div>
                  <strong>
                    {announcementAttachmentViewer.attachment.originalFileName}
                  </strong>
                  <span>
                    {announcementEnumLabel(
                      announcementAttachmentViewer.attachment.category,
                      t,
                    )}{" "}
                    ·{" "}
                    {formatFileSize(
                      announcementAttachmentViewer.attachment.fileSizeBytes,
                    )}
                  </span>
                </div>
                {announcementAttachmentViewerItems.length > 1 &&
                  announcementAttachmentViewerIndex >= 0 && (
                    <span>
                      {announcementAttachmentViewerIndex + 1} /{" "}
                      {announcementAttachmentViewerItems.length}
                    </span>
                  )}
              </footer>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
