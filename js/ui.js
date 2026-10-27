import { state, getChatStates, pushAction } from "./state.js";
import { sendMessageNonStream as rawSendMessageNonStream, translateMessageText } from "../services/openrouter.js";
import { getEffectiveApiConfig } from "../services/apiHelper.js";
import { 
  getActiveChatId, 
  saveChatStates, 
  getStateType, 
  getStageBehavior, 
  BUILTIN_STATES,
  isDuoChat,
  loadPersonas,
  savePersonas,
  getActivePersonaId,
  setActivePersonaId,
  getActivePersona,
  createPersonaDataFromCharacter,
  loadPinnedFacts,
  savePinnedFacts,
  saveChats,
  saveGmChats,
  saveCharacterDirectives,
  getSessionMemory,
  saveSessionMemory
} from "../services/storage.js";
import { createDefaultSessionMemory } from "../services/sessionMemoryService.js";

const MAX_VISIBLE_MESSAGES = 100;
const MESSAGE_PAGE_SIZE = 50;

/**
 * How many messages are loaded *beyond* the default window. The oldest ones
 * used to be dropped from the DOM with no indication, so long chats silently
 * lost their history; the "load earlier" button raises this instead.
 * Reset whenever the active chat changes.
 */
let messagesLoadedBeyondWindow = 0;

/**
 * True only while the "load earlier" button is re-rendering, so scroll
 * restoration anchors on the first article instead of jumping to the bottom.
 */
let isLoadingEarlier = false;
const MOOD_EMOJIS = {
  happy: "😊",
  sad: "😢",
  angry: "😠",
  flirty: "😳",
  neutral: "😐",
  excited: "🤩",
  nervous: "😰"
};

export const dom = {
  app: document.querySelector(".app"),
  characterList: document.getElementById("characterList"),
  activeCharacterName: document.getElementById("activeCharacterName"),
  moodIndicator: document.getElementById("moodIndicator"),
  messages: document.getElementById("messages"),
  chatForm: document.getElementById("chatForm"),
  messageInput: document.getElementById("messageInput"),
  sendBtn: document.getElementById("sendBtn"),
  characterTurnBtn: document.getElementById("characterTurnBtn"),
  attachImageBtn: document.getElementById("attachImageBtn"),
  imageFileInput: document.getElementById("imageFileInput"),
  emojiPickerBtn: document.getElementById("emojiPickerBtn"),
  emojiPickerPanel: document.getElementById("emojiPickerPanel"),
  imagePreviewContainer: document.getElementById("imagePreviewContainer"),
  imageViewerModal: document.getElementById("imageViewerModal"),
  imageViewerImg: document.getElementById("imageViewerImg"),
  closeImageViewerBtn: document.getElementById("closeImageViewerBtn"),
  directivesBar: document.getElementById("directivesBar"),
  directiveModal: document.getElementById("directiveModal"),
  directiveModalTitle: document.getElementById("directiveModalTitle"),
  directiveTextInput: document.getElementById("directiveTextInput"),
  saveDirectiveBtn: document.getElementById("saveDirectiveBtn"),
  activeModelBadge: document.getElementById("activeModelBadge"),
  sidebarModelSwitcher: document.getElementById("sidebarModelSwitcher"),
  sidebarModelActiveName: document.getElementById("sidebarModelActiveName"),
  quickModelBtnGlm52: document.getElementById("quickModelBtnGlm52"),
  quickModelBtnGlm53Flash: document.getElementById("quickModelBtnGlm53Flash"),
  customStatesPanel: document.getElementById("customStatesPanel"),
  statusConditionsPanel: document.getElementById("statusConditionsPanel"),
  stateNotifications: document.getElementById("stateNotifications"),
  characterSearchInput: document.getElementById("characterSearchInput"),
  openSettingsBtn: document.getElementById("openSettingsBtn"),
  settingsDialog: document.getElementById("settingsDialog"),
  statusText: document.getElementById("statusText"),
  apiStatusText: document.getElementById("apiStatusText"),
  
  apiKeyInput: document.getElementById("apiKeyInput"),
  apiProviderSelect: document.getElementById("apiProviderSelect"),
  nordrouterFields: document.getElementById("nordrouterFields"),
  nordrouterApiKeyInput: document.getElementById("nordrouterApiKeyInput"),
  nordrouterBaseUrlInput: document.getElementById("nordrouterBaseUrlInput"),
  openrouterFields: document.getElementById("openrouterFields"),
  providerSortSelect: document.getElementById("providerSortSelect"),
  specificProviderSelect: document.getElementById("specificProviderSelect"),
  specificProviderStatus: document.getElementById("specificProviderStatus"),
  specificProviderInput: document.getElementById("specificProviderInput"),
  allowFallbacksInput: document.getElementById("allowFallbacksInput"),
  localLlmFields: document.getElementById("localLlmFields"),
  localBaseUrlInput: document.getElementById("localBaseUrlInput"),
  localApiKeyInput: document.getElementById("localApiKeyInput"),
  modelLabel: document.getElementById("modelLabel"),
  customModelInput: document.getElementById("customModelInput"),
  modelSelect: document.getElementById("modelSelect"),
  evaluatorModelLabel: document.getElementById("evaluatorModelLabel"),
  evaluatorModelSelect: document.getElementById("evaluatorModelSelect"),
  customEvaluatorModelInput: document.getElementById("customEvaluatorModelInput"),
  translationModelLabel: document.getElementById("translationModelLabel"),
  translationModelSelect: document.getElementById("translationModelSelect"),
  customTranslationModelInput: document.getElementById("customTranslationModelInput"),
  jevModelLabel: document.getElementById("jevModelLabel"),
  jevModelSelect: document.getElementById("jevModelSelect"),
  customJevModelInput: document.getElementById("customJevModelInput"),
  jevActiveModelName: document.getElementById("jevActiveModelName"),
  refreshModelsBtn: document.getElementById("refreshModelsBtn"),
  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  clearEnvBtn: document.getElementById("clearEnvBtn"),
  importFileInput: document.getElementById("importFileInput"),
  globalSystemPromptInput: document.getElementById("globalSystemPromptInput"),
  previewPromptBtn: document.getElementById("previewPromptBtn"),
  temperatureInput: document.getElementById("temperatureInput"),
  repetitionPenaltyInput: document.getElementById("repetitionPenaltyInput"),
  presencePenaltyInput: document.getElementById("presencePenaltyInput"),
  frequencyPenaltyInput: document.getElementById("frequencyPenaltyInput"),
  topPInput: document.getElementById("topPInput"),
  minPInput: document.getElementById("minPInput"),
  maxTokensInput: document.getElementById("maxTokensInput"),
  thinkingDisplaySelect: document.getElementById("thinkingDisplaySelect"),
  thinkingToggleBtn: document.getElementById("thinkingToggleBtn"),
  enableInnerMonologueInput: document.getElementById("enableInnerMonologueInput"),
  enableHiddenTraitsToggle: document.getElementById("enableHiddenTraitsToggle"),
  enableEvaluatorInput: document.getElementById("enableEvaluatorInput"),
  stabsEdhToggle: document.getElementById("stabsEdhToggle"),
  stateForm: document.getElementById("stateForm"),
  stateKeyInput: document.getElementById("stateKeyInput"),
  stateValueInput: document.getElementById("stateValueInput"),
  stateTypeSelect: document.getElementById("stateTypeSelect"),
  undoBtn: document.getElementById("undoBtn"),
  redoBtn: document.getElementById("redoBtn"),
  stateList: document.getElementById("stateList"),
  moodSelect: document.getElementById("moodSelect"),
  stateProposalList: document.getElementById("stateProposalList"),
  manageCharactersBtn: document.getElementById("manageCharactersBtn"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  debugMenuBtn: document.getElementById("debugMenuBtn"),
  
  chatSelectorContainer: document.getElementById("chatSelectorContainer"),
  chatSelector: document.getElementById("chatSelector"),
  newChatBtn: document.getElementById("newChatBtn"),
  chatMoreActionsBtn: document.getElementById("chatMoreActionsBtn"),
  chatActionsDropdown: document.getElementById("chatActionsDropdown"),
  newChatUserFirstBtn: document.getElementById("newChatUserFirstBtn"),
  convertToGmSceneBtn: document.getElementById("convertToGmSceneBtn"),
  renameChatBtn: document.getElementById("renameChatBtn"),
  restartChatBtn: document.getElementById("restartChatBtn"),
  deleteChatBtn: document.getElementById("deleteChatBtn"),

  debugDialog: document.getElementById("debugDialog"),
  debugLogList: document.getElementById("debugLogList"),
  debugLogDetail: document.getElementById("debugLogDetail"),
  jevDebugBanner: document.getElementById("jevDebugBanner"),
  jevStatusPill: document.getElementById("jevStatusPill"),
  jevCount: document.getElementById("jevCount"),
  jevAvgLatency: document.getElementById("jevAvgLatency"),
  testJevBtn: document.getElementById("testJevBtn"),
  jevTestResult: document.getElementById("jevTestResult"),
  debugFilterBtns: document.querySelectorAll(".debug-filter-btn"),
  
  adminDialog: document.getElementById("adminDialog"),
  adminCharacterList: document.getElementById("adminCharacterList"),
  adminFeedback: document.getElementById("adminFeedback"),
  characterForm: document.getElementById("characterForm"),
  characterId: document.getElementById("characterId"),
  characterName: document.getElementById("characterName"),
  characterPersonality: document.getElementById("characterPersonality"),
  characterScenario: document.getElementById("characterScenario"),
  characterDescription: document.getElementById("characterDescription"),
  characterPrompt: document.getElementById("characterPrompt"),
  characterGender: document.getElementById("characterGender"),
  characterModelSelect: document.getElementById("characterModelSelect"),
  characterExampleDialogs: document.getElementById("characterExampleDialogs"),
  characterAppearance: document.getElementById("characterAppearance"),
  characterBehavior: document.getElementById("characterBehavior"),
  characterBackstory: document.getElementById("characterBackstory"),
  characterSpeech: document.getElementById("characterSpeech"),
  characterImagePrompt: document.getElementById("characterImagePrompt"),
  characterAvatarFileInput: document.getElementById("characterAvatarFileInput"),
  characterAvatarUrl: document.getElementById("characterAvatarUrl"),
  characterAvatarPreview: document.getElementById("characterAvatarPreview"),
  uploadAvatarBtn: document.getElementById("uploadAvatarBtn"),
  clearAvatarBtn: document.getElementById("clearAvatarBtn"),
  userNameInput: document.getElementById("userNameInput"),
  userPronounsSelect: document.getElementById("userPronounsSelect"),
  responseLengthSelect: document.getElementById("responseLengthSelect"),
  chatLanguageSelect: document.getElementById("chatLanguageSelect"),
  worldGenreSelect: document.getElementById("worldGenreSelect"),
  chatWorldGenreSelect: document.getElementById("chatWorldGenreSelect"),
  summaryModeSelect: document.getElementById("summaryModeSelect"),
  initiativeLevelSelect: document.getElementById("initiativeLevelSelect"),
  maxHistoryMessagesSelect: document.getElementById("maxHistoryMessagesSelect"),
  saveCharacterBtn: document.getElementById("saveCharacterBtn"),
  deleteCharacterBtn: document.getElementById("deleteCharacterBtn"),
  characterTraits: document.getElementById("characterTraits"),
  characterHiddenTraits: document.getElementById("characterHiddenTraits"),
  characterFirstMessage: document.getElementById("characterFirstMessage"),
  characterFirstMessageMode: document.getElementById("characterFirstMessageMode"),
  aiRefinerInstruction: document.getElementById("aiRefinerInstruction"),
  aiRefineBtn: document.getElementById("aiRefineBtn"),
  aiRefinerFeedback: document.getElementById("aiRefinerFeedback"),
  settingsModelDetails: document.getElementById("settingsModelDetails"),
  statsModelName: document.getElementById("statsModelName"),
  statsContextLimit: document.getElementById("statsContextLimit"),
  statsPricing: document.getElementById("statsPricing"),
  statsLastPromptTokens: document.getElementById("statsLastPromptTokens"),
  statsLastCompletionTokens: document.getElementById("statsLastCompletionTokens"),
  statsLastCost: document.getElementById("statsLastCost"),
  headerTokenBadge: document.getElementById("headerTokenBadge"),
  statsSummaryPresent: document.getElementById("statsSummaryPresent"),
  viewSummaryBtn: document.getElementById("viewSummaryBtn"),
  summaryDialog: document.getElementById("summaryDialog"),
  summaryTextInput: document.getElementById("summaryTextInput"),
  saveSummaryBtn: document.getElementById("saveSummaryBtn"),
  forceGenerateSummaryBtn: document.getElementById("forceGenerateSummaryBtn"),
  resetCharacterPersonalityBtn: document.getElementById("resetCharacterPersonalityBtn"),
  summaryStatusBadge: document.getElementById("summaryStatusBadge"),
  summaryFeedbackMsg: document.getElementById("summaryFeedbackMsg"),
  generateWorldLoreBtn: document.getElementById("generateWorldLoreBtn"),
  openWorldLoreBtn: document.getElementById("openWorldLoreBtn"),
  worldLoreDialog: document.getElementById("worldLoreDialog"),
  rebuildWorldLoreBtn: document.getElementById("rebuildWorldLoreBtn"),
  worldLoreLocationsList: document.getElementById("worldLoreLocationsList"),
  worldLoreRulesList: document.getElementById("worldLoreRulesList"),
  worldLoreFactionsList: document.getElementById("worldLoreFactionsList"),
  worldLoreItemsList: document.getElementById("worldLoreItemsList"),
  addLocationLoreBtn: document.getElementById("addLocationLoreBtn"),
  addRuleLoreBtn: document.getElementById("addRuleLoreBtn"),
  addFactionLoreBtn: document.getElementById("addFactionLoreBtn"),
  addItemLoreBtn: document.getElementById("addItemLoreBtn"),
  saveWorldLoreBtn: document.getElementById("saveWorldLoreBtn"),
  worldLoreFeedbackMsg: document.getElementById("worldLoreFeedbackMsg"),
  statsOpenRouterCredits: document.getElementById("statsOpenRouterCredits"),
  statsTotalSpent: document.getElementById("statsTotalSpent"),
  resetSpentBtn: document.getElementById("resetSpentBtn"),
  toggleEventLogBtn: document.getElementById("toggleEventLogBtn"),
  clearEventLogBtn: document.getElementById("clearEventLogBtn"),
  eventLogPanel: document.getElementById("eventLogPanel"),
  eventLogList: document.getElementById("eventLogList"),
  toggleSidebarRightBtn: document.getElementById("toggleSidebarRightBtn"),
  closeSidebarRightBtn: document.getElementById("closeSidebarRightBtn"),
  sidebarRight: document.getElementById("sidebarRight"),
  sidebarRightTabs: document.getElementById("sidebarRightTabs"),
  rightTabContentMemory: document.getElementById("rightTabContentMemory"),
  rightTabContentCharacter: document.getElementById("rightTabContentCharacter"),
  rightTabContentStats: document.getElementById("rightTabContentStats"),
  headerCharAvatarWrap: document.getElementById("headerCharAvatarWrap"),
  headerCharAvatarImg: document.getElementById("headerCharAvatarImg"),
  headerCharAvatarFallback: document.getElementById("headerCharAvatarFallback"),
  toggleSidebarLeftBtn: document.getElementById("toggleSidebarLeftBtn"),
  sidebarLeftBackdrop: document.getElementById("sidebarLeftBackdrop"),
  sidebarLeft: document.getElementById("sidebarLeft"),
  quickCreateCharBtn: document.getElementById("quickCreateCharBtn"),
  editCharacterBtn: document.getElementById("editCharacterBtn"),
  chatHeaderEnhanceBtn: document.getElementById("chatHeaderEnhanceBtn"),
  adminWizardView: document.getElementById("adminWizardView"),
  wizardChatHistory: document.getElementById("wizardChatHistory"),
  wizardInput: document.getElementById("wizardInput"),
  wizardSendBtn: document.getElementById("wizardSendBtn"),
  wizardFeedback: document.getElementById("wizardFeedback"),
  wizardFinalizeBtn: document.getElementById("wizardFinalizeBtn"),
  wizardModelSelect: document.getElementById("wizardModelSelect"),
  startWizardBtn: document.getElementById("startWizardBtn"),
  // Character Card Import elements
  quickImportCharBtn: document.getElementById("quickImportCharBtn"),
  adminImportCardBtn: document.getElementById("adminImportCardBtn"),
  studioImportCardBtn: document.getElementById("studioImportCardBtn"),
  characterCardFileInput: document.getElementById("characterCardFileInput"),
  cardImportDialog: document.getElementById("cardImportDialog"),
  closeCardImportBtn: document.getElementById("closeCardImportBtn"),
  cardImportAvatarPreview: document.getElementById("cardImportAvatarPreview"),
  cardImportName: document.getElementById("cardImportName"),
  cardImportFormatBadge: document.getElementById("cardImportFormatBadge"),
  cardImportDesc: document.getElementById("cardImportDesc"),
  cardImportLoreBadge: document.getElementById("cardImportLoreBadge"),
  cardImportAltGreetingsBadge: document.getElementById("cardImportAltGreetingsBadge"),
  cardImportModelSelect: document.getElementById("cardImportModelSelect"),
  cardImportOriginalPreview: document.getElementById("cardImportOriginalPreview"),
  cardImportProgress: document.getElementById("cardImportProgress"),
  cardImportProgressText: document.getElementById("cardImportProgressText"),
  cardImportError: document.getElementById("cardImportError"),
  cardImportAdaptBtn: document.getElementById("cardImportAdaptBtn"),
  cardImportAsIsBtn: document.getElementById("cardImportAsIsBtn"),
  cardImportCancelBtn: document.getElementById("cardImportCancelBtn"),
  // Character Enhancer elements
  startCharacterEnhancerBtn: document.getElementById("startCharacterEnhancerBtn"),
  characterEnhancerDialog: document.getElementById("characterEnhancerDialog"),
  closeCharacterEnhancerBtn: document.getElementById("closeCharacterEnhancerBtn"),
  enhancerAvatarPreview: document.getElementById("enhancerAvatarPreview"),
  enhancerCharName: document.getElementById("enhancerCharName"),
  enhancerNsfwBadge: document.getElementById("enhancerNsfwBadge"),
  enhancerCharDesc: document.getElementById("enhancerCharDesc"),
  enhancerNsfwToggle: document.getElementById("enhancerNsfwToggle"),
  enhancerPresetSelect: document.getElementById("enhancerPresetSelect"),
  enhancerUserInstructions: document.getElementById("enhancerUserInstructions"),
  enhancerModelSelect: document.getElementById("enhancerModelSelect"),
  enhancerSubmitBtn: document.getElementById("enhancerSubmitBtn"),
  enhancerProgress: document.getElementById("enhancerProgress"),
  enhancerProgressText: document.getElementById("enhancerProgressText"),
  enhancerError: document.getElementById("enhancerError"),
  enhancerResultSection: document.getElementById("enhancerResultSection"),
  enhancerAuditSummary: document.getElementById("enhancerAuditSummary"),
  enhancerAuditWeaknesses: document.getElementById("enhancerAuditWeaknesses"),
  enhancerAuditImprovements: document.getElementById("enhancerAuditImprovements"),
  enhancerPreviewFirstMessage: document.getElementById("enhancerPreviewFirstMessage"),
  enhancerPreviewAppearance: document.getElementById("enhancerPreviewAppearance"),
  enhancerPreviewBehavior: document.getElementById("enhancerPreviewBehavior"),
  enhancerPreviewSpeech: document.getElementById("enhancerPreviewSpeech"),
  enhancerPreviewScenario: document.getElementById("enhancerPreviewScenario"),
  enhancerPreviewCoreStates: document.getElementById("enhancerPreviewCoreStates"),
  enhancerApplyBtn: document.getElementById("enhancerApplyBtn"),
  enhancerCancelBtn: document.getElementById("enhancerCancelBtn"),
  // Character Catalog elements
  openCatalogBtn: document.getElementById("openCatalogBtn"),
  openCatalogBannerBtn: document.getElementById("openCatalogBannerBtn"),
  characterCatalogDialog: document.getElementById("characterCatalogDialog"),
  closeCatalogDialogBtn: document.getElementById("closeCatalogDialogBtn"),
  catalogTabsNav: document.getElementById("catalogTabsNav"),
  catalogTabCuratedBtn: document.getElementById("catalogTabCuratedBtn"),
  catalogTabChubBtn: document.getElementById("catalogTabChubBtn"),
  catalogTabUrlBtn: document.getElementById("catalogTabUrlBtn"),
  catalogTabCuratedContent: document.getElementById("catalogTabCuratedContent"),
  catalogTabChubContent: document.getElementById("catalogTabChubContent"),
  catalogTabUrlContent: document.getElementById("catalogTabUrlContent"),
  curatedGenreChips: document.getElementById("curatedGenreChips"),
  curatedSearchInput: document.getElementById("curatedSearchInput"),
  curatedCardsGrid: document.getElementById("curatedCardsGrid"),
  chubSearchInput: document.getElementById("chubSearchInput"),
  chubSearchSubmitBtn: document.getElementById("chubSearchSubmitBtn"),
  chubSortSelect: document.getElementById("chubSortSelect"),
  chubNsfwToggle: document.getElementById("chubNsfwToggle"),
  chubLoadingSpinner: document.getElementById("chubLoadingSpinner"),
  chubEmptyState: document.getElementById("chubEmptyState"),
  chubErrorState: document.getElementById("chubErrorState"),
  chubErrorMessage: document.getElementById("chubErrorMessage"),
  chubRetryBtn: document.getElementById("chubRetryBtn"),
  chubCardsGrid: document.getElementById("chubCardsGrid"),
  chubPaginationBar: document.getElementById("chubPaginationBar"),
  chubPrevPageBtn: document.getElementById("chubPrevPageBtn"),
  chubNextPageBtn: document.getElementById("chubNextPageBtn"),
  chubCurrentPageNum: document.getElementById("chubCurrentPageNum"),
  chubTotalPagesNum: document.getElementById("chubTotalPagesNum"),
  chubUrlInput: document.getElementById("chubUrlInput"),
  chubUrlDownloadBtn: document.getElementById("chubUrlDownloadBtn"),
  chubUrlStatus: document.getElementById("chubUrlStatus"),
  catalogDropZone: document.getElementById("catalogDropZone"),
  catalogFileInput: document.getElementById("catalogFileInput"),
  catalogSelectFileBtn: document.getElementById("catalogSelectFileBtn"),
  // Time Skip elements
  timeSkipBtn: document.getElementById("timeSkipBtn"),
  timeSkipDropdownBtn: document.getElementById("timeSkipDropdownBtn"),
  timeSkipDialog: document.getElementById("timeSkipDialog"),
  timeSkipDurationInput: document.getElementById("timeSkipDurationInput"),
  timeSkipDetailsInput: document.getElementById("timeSkipDetailsInput"),
  timeSkipAutoGenerateToggle: document.getElementById("timeSkipAutoGenerateToggle"),
  timeSkipInsertInputBtn: document.getElementById("timeSkipInsertInputBtn"),
  timeSkipSubmitBtn: document.getElementById("timeSkipSubmitBtn"),
  timeSkipCancelBtn: document.getElementById("timeSkipCancelBtn"),
  chatScenarioBtn: document.getElementById("chatScenarioBtn"),
  chatScenarioDialog: document.getElementById("chatScenarioDialog"),
  chatScenarioInput: document.getElementById("chatScenarioInput"),
  chatScenarioSaveBtn: document.getElementById("chatScenarioSaveBtn"),
  chatScenarioResetBtn: document.getElementById("chatScenarioResetBtn"),
  chatScenarioCancelBtn: document.getElementById("chatScenarioCancelBtn"),
  chatScenarioRestartBtn: document.getElementById("chatScenarioRestartBtn"),
  chatScenarioRegenToggle: document.getElementById("chatScenarioRegenToggle"),
  chatScenarioOptionsWrap: document.getElementById("chatScenarioOptionsWrap"),
  chatScenarioRegenHint: document.getElementById("chatScenarioRegenHint"),
  fontSizeDecBtn: document.getElementById("fontSizeDecBtn"),
  fontSizeIncBtn: document.getElementById("fontSizeIncBtn"),
  fontSizeDisplay: document.getElementById("fontSizeDisplay"),
  // Reader Comfort & Header State
  headerStateBadge: document.getElementById("headerStateBadge"),
  headerStateBadgeText: document.getElementById("headerStateBadgeText"),
  readerSettingsBtn: document.getElementById("readerSettingsBtn"),
  readerSettingsPopover: document.getElementById("readerSettingsPopover"),
  closeReaderSettingsBtn: document.getElementById("closeReaderSettingsBtn"),
  readerFontDecBtn: document.getElementById("readerFontDecBtn"),
  readerFontIncBtn: document.getElementById("readerFontIncBtn"),
  readerFontSizeVal: document.getElementById("readerFontSizeVal"),
  chatScrollBottomBtn: document.getElementById("chatScrollBottomBtn"),
  chatScrollBottomBadge: document.getElementById("chatScrollBottomBadge"),
  // Character Studio 2.0 elements
  studioConceptInput: document.getElementById("studioConceptInput"),
  studioRandomBtn: document.getElementById("studioRandomBtn"),
  studioGenerateBtn: document.getElementById("studioGenerateBtn"),
  studioFeedback: document.getElementById("studioFeedback"),
  studioCardsContainer: document.getElementById("studioCardsContainer"),
  studioNameInput: document.getElementById("studioNameInput"),
  studioGenderSelect: document.getElementById("studioGenderSelect"),
  studioDescriptionInput: document.getElementById("studioDescriptionInput"),
  studioTraitsInput: document.getElementById("studioTraitsInput"),
  studioHiddenTraitsInput: document.getElementById("studioHiddenTraitsInput"),
  studioAppearanceInput: document.getElementById("studioAppearanceInput"),
  studioBehaviorInput: document.getElementById("studioBehaviorInput"),
  studioSpeechInput: document.getElementById("studioSpeechInput"),
  studioScenarioInput: document.getElementById("studioScenarioInput"),
  studioFirstMessageInput: document.getElementById("studioFirstMessageInput"),
  greetingVariantsTabs: document.getElementById("greetingVariantsTabs"),
  studioGenerateGreetingVariantsBtn: document.getElementById("studioGenerateGreetingVariantsBtn"),
  studioAvatarPreview: document.getElementById("studioAvatarPreview"),
  studioPreviewName: document.getElementById("studioPreviewName"),
  studioPreviewDesc: document.getElementById("studioPreviewDesc"),
  studioPreviewTraits: document.getElementById("studioPreviewTraits"),
  studioPreviewSpeaker: document.getElementById("studioPreviewSpeaker"),
  studioPreviewDialogue: document.getElementById("studioPreviewDialogue"),
  studioSaveAndChatBtn: document.getElementById("studioSaveAndChatBtn"),
  studioMakePersonaBtn: document.getElementById("studioMakePersonaBtn"),
  studioOpenFullEditorBtn: document.getElementById("studioOpenFullEditorBtn"),
  characterFormMakePersonaBtn: document.getElementById("characterFormMakePersonaBtn"),
  adoptActiveCharAsPersonaBtn: document.getElementById("adoptActiveCharAsPersonaBtn"),
  coreStatesList: document.getElementById("coreStatesList"),
  addCoreStateBtn: document.getElementById("addCoreStateBtn"),
  openPersonaBtn: document.getElementById("openPersonaBtn"),
  composerPersonaBtn: document.getElementById("composerPersonaBtn"),
  composerPersonaName: document.getElementById("composerPersonaName"),
  composerPersonaAvatar: document.getElementById("composerPersonaAvatar"),
  searchPersonaInput: document.getElementById("searchPersonaInput"),
  headerNewPersonaBtn: document.getElementById("headerNewPersonaBtn"),
  headerImportPersonaFromCharBtn: document.getElementById("headerImportPersonaFromCharBtn"),
  footerImportPersonaFromCharBtn: document.getElementById("footerImportPersonaFromCharBtn"),
  personaFromCharSelectDialog: document.getElementById("personaFromCharSelectDialog"),
  personaFromCharList: document.getElementById("personaFromCharList"),
  personaCardList: document.getElementById("personaCardList"),
  playingAsPersonaName: document.getElementById("playingAsPersonaName"),
  personaCardView: document.getElementById("personaCardView"),
  personaEditFormContainer: document.getElementById("personaEditFormContainer"),
  backToPersonaListBtn: document.getElementById("backToPersonaListBtn"),
  personaDialog: document.getElementById("personaDialog"),
  createNewPersonaBtn: document.getElementById("createNewPersonaBtn"),
  personaList: document.getElementById("personaList"),
  personaForm: document.getElementById("personaForm"),
  personaId: document.getElementById("personaId"),
  personaNameInput: document.getElementById("personaNameInput"),
  personaUserNameInput: document.getElementById("personaUserNameInput"),
  personaPronounsSelect: document.getElementById("personaPronounsSelect"),
  personaDescriptionInput: document.getElementById("personaDescriptionInput"),
  savePersonaBtn: document.getElementById("savePersonaBtn"),
  deletePersonaBtn: document.getElementById("deletePersonaBtn"),
  personaFeedback: document.getElementById("personaFeedback"),

  // Prompt Wizard elements
  startPromptWizardBtn: document.getElementById("startPromptWizardBtn"),
  promptWizardDialog: document.getElementById("promptWizardDialog"),
  promptWizardHistory: document.getElementById("promptWizardHistory"),
  promptWizardInput: document.getElementById("promptWizardInput"),
  promptWizardSendBtn: document.getElementById("promptWizardSendBtn"),
  promptWizardFeedback: document.getElementById("promptWizardFeedback"),
  promptWizardApplyBtn: document.getElementById("promptWizardApplyBtn"),

  // LoreBook elements
  loreBookList: document.getElementById("loreBookList"),
  addLoreEntryBtn: document.getElementById("addLoreEntryBtn"),

  // Memory Manager elements
  recalcMemoryBtn: document.getElementById("recalcMemoryBtn"),
  addPinnedFactForm: document.getElementById("addPinnedFactForm"),
  newPinnedFactInput: document.getElementById("newPinnedFactInput"),
  pinnedFactsList: document.getElementById("pinnedFactsList"),
  storySummaryInput: document.getElementById("storySummaryInput"),
  saveSummaryBtn: document.getElementById("saveSummaryBtn"),

  // Session Codex elements
  openSessionCodexBtn: document.getElementById("openSessionCodexBtn"),
  sidebarCodexPreview: document.getElementById("sidebarCodexPreview"),
  sidebarCodexSyncBadge: document.getElementById("sidebarCodexSyncBadge"),
  sidebarCodexLocation: document.getElementById("sidebarCodexLocation"),
  sidebarCodexStatus: document.getElementById("sidebarCodexStatus"),
  tabCodexStructuredBtn: document.getElementById("tabCodexStructuredBtn"),
  tabCodexSummaryBtn: document.getElementById("tabCodexSummaryBtn"),
  tabCodexJsonBtn: document.getElementById("tabCodexJsonBtn"),
  codexStructuredView: document.getElementById("codexStructuredView"),
  codexSummaryView: document.getElementById("codexSummaryView"),
  codexJsonView: document.getElementById("codexJsonView"),
  codexStatusBadge: document.getElementById("codexStatusBadge"),
  btnAiUpdateCodex: document.getElementById("btnAiUpdateCodex"),
  btnSaveCodex: document.getElementById("btnSaveCodex"),
  codexCurrentStatusInput: document.getElementById("codexCurrentStatusInput"),
  codexLocationInput: document.getElementById("codexLocationInput"),
  codexTimeInput: document.getElementById("codexTimeInput"),
  codexAtmosphereInput: document.getElementById("codexAtmosphereInput"),
  codexWorldRulesInput: document.getElementById("codexWorldRulesInput"),
  btnAddCodexCharBtn: document.getElementById("btnAddCodexCharBtn"),
  codexCharactersList: document.getElementById("codexCharactersList"),
  codexIntimateDynamicsInput: document.getElementById("codexIntimateDynamicsInput"),
  codexBoundariesInput: document.getElementById("codexBoundariesInput"),
  codexPreferencesInput: document.getElementById("codexPreferencesInput"),
  codexRecentIntimateEventsInput: document.getElementById("codexRecentIntimateEventsInput"),
  newCodexThreadInput: document.getElementById("newCodexThreadInput"),
  addCodexThreadBtn: document.getElementById("addCodexThreadBtn"),
  codexThreadsList: document.getElementById("codexThreadsList"),
  btnAddCodexEventBtn: document.getElementById("btnAddCodexEventBtn"),
  codexEventsList: document.getElementById("codexEventsList"),
  codexJsonInput: document.getElementById("codexJsonInput"),
  btnApplyCodexJson: document.getElementById("btnApplyCodexJson"),

  // Duo Mode elements
  duoChatBtn: document.getElementById("duoChatBtn"),
  duoCharSelectDialog: document.getElementById("duoCharSelectDialog"),
  duoCharSelect: document.getElementById("duoCharSelect"),
  duoCharConfirmBtn: document.getElementById("duoCharConfirmBtn"),
  duoModeToggle: document.getElementById("duoModeToggle"),
  duoBothSpeakToggle: document.getElementById("duoBothSpeakToggle"),
  duoBothSpeakLabel: document.getElementById("duoBothSpeakLabel"),

  // GM Mode elements
  tabCharactersBtn: document.getElementById("tabCharactersBtn"),
  tabGmScenesBtn: document.getElementById("tabGmScenesBtn"),
  charactersSection: document.getElementById("charactersSection"),
  gmScenesSection: document.getElementById("gmScenesSection"),
  createGmSceneBtn: document.getElementById("createGmSceneBtn"),
  gmSceneSearchInput: document.getElementById("gmSceneSearchInput"),
  gmSceneList: document.getElementById("gmSceneList"),
  gmSceneDialog: document.getElementById("gmSceneDialog"),
  gmSceneDialogTitle: document.getElementById("gmSceneDialogTitle"),
  gmSceneNameInput: document.getElementById("gmSceneNameInput"),
  gmSceneScenarioInput: document.getElementById("gmSceneScenarioInput"),
  gmScenePromptInput: document.getElementById("gmScenePromptInput"),
  gmSceneAddNpcBtn: document.getElementById("gmSceneAddNpcBtn"),
  gmSceneImportNpcBtn: document.getElementById("gmSceneImportNpcBtn"),
  gmSceneNpcList: document.getElementById("gmSceneNpcList"),
  gmSceneSaveBtn: document.getElementById("gmSceneSaveBtn"),
  gmSceneDeleteBtn: document.getElementById("gmSceneDeleteBtn"),
  gmSceneImportDialog: document.getElementById("gmSceneImportDialog"),
  gmSceneImportSelect: document.getElementById("gmSceneImportSelect"),
  gmSceneImportConfirmBtn: document.getElementById("gmSceneImportConfirmBtn"),
  gmNpcEditDialog: document.getElementById("gmNpcEditDialog"),
  gmNpcEditTitle: document.getElementById("gmNpcEditTitle"),
  gmNpcNameInput: document.getElementById("gmNpcNameInput"),
  gmNpcGenderSelect: document.getElementById("gmNpcGenderSelect"),
  gmNpcSpeechInput: document.getElementById("gmNpcSpeechInput"),
  gmNpcPersonalityInput: document.getElementById("gmNpcPersonalityInput"),
  gmNpcBehaviorInput: document.getElementById("gmNpcBehaviorInput"),
  gmNpcDescInput: document.getElementById("gmNpcDescInput"),
  gmNpcAppearanceInput: document.getElementById("gmNpcAppearanceInput"),
  gmNpcSaveBtn: document.getElementById("gmNpcSaveBtn"),
  gmSceneHeaderBanner: document.getElementById("gmSceneHeaderBanner"),
  gmBannerScenarioText: document.getElementById("gmBannerScenarioText"),
  gmBannerParticipantsList: document.getElementById("gmBannerParticipantsList"),

  // Character Refine Wizard elements
  startRefineWizardBtn: document.getElementById("startRefineWizardBtn"),
  characterRefineDialog: document.getElementById("characterRefineDialog"),
  characterRefineTitle: document.getElementById("characterRefineTitle"),
  characterRefineChatHistory: document.getElementById("characterRefineChatHistory"),
  characterRefineInput: document.getElementById("characterRefineInput"),
  characterRefineSendBtn: document.getElementById("characterRefineSendBtn"),
  characterRefineFeedback: document.getElementById("characterRefineFeedback"),
  characterRefineApplyBtn: document.getElementById("characterRefineApplyBtn")
};

const sendMessageNonStream = (options) => {
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  return rawSendMessageNonStream({
    repetitionPenalty: apiConfig.repetitionPenalty,
    topP: apiConfig.topP,
    minP: apiConfig.minP,
    ...options
  });
};

// --- Callback Observer Registries ---
let triggerStageGenCallback = null;
let applyProposalCallback = null;
let dismissProposalCallback = null;
let generateStagesCallback = null;
let editMessageCallback = null;
let replyMessageCallback = null;
let deleteMessageCallback = null;
let reactionCallback = null;
let selectCharacterCallback = null;
let buildSystemContextCallback = null;
let regenerateCallback = null; 
let generateLoreTriggersCallback = null; // LoreBook callback trigger
let improveLoreContentCallback = null; // LoreBook content generator trigger
let refineCharacterCallback = null; // Character AI Refiner trigger
let addStatusConditionCallback = null;
let removeStatusConditionCallback = null;

export function onTriggerStageGeneration(cb) { triggerStageGenCallback = cb; }
export function onApplyProposal(cb) { applyProposalCallback = cb; }
export function onDismissProposal(cb) { dismissProposalCallback = cb; }
export function onGenerateStages(cb) { generateStagesCallback = cb; }
export function onEditMessage(cb) { editMessageCallback = cb; }
export function onReplyMessage(cb) { replyMessageCallback = cb; }
export function onDeleteMessage(cb) { deleteMessageCallback = cb; }
export function onReactionChange(cb) { reactionCallback = cb; }
export function onSelectCharacter(cb) { selectCharacterCallback = cb; }
export function onBuildSystemContext(cb) { buildSystemContextCallback = cb; }
export function onInlineRegenerate(cb) { regenerateCallback = cb; }
export function onGenerateLoreTriggers(cb) { generateLoreTriggersCallback = cb; }
export function onImproveLoreContent(cb) { improveLoreContentCallback = cb; } // Register LoreBook content improve/generator
export function onRefineCharacter(cb) { refineCharacterCallback = cb; } // Register character refine callback
export function onAddStatusCondition(cb) { addStatusConditionCallback = cb; }
export function onRemoveStatusCondition(cb) { removeStatusConditionCallback = cb; }
let swipeCallback = null;
let continueCallback = null;
export function onSwipeMessage(cb) { swipeCallback = cb; }
export function onContinueMessage(cb) { continueCallback = cb; }

// --- Inline Message Editing ---

function startInlineEdit(article, msgIndex, message, dialogueEl, parsed) {
  // Prevent double-editing
  if (article.classList.contains("editing")) return;
  article.classList.add("editing");

  // Determine the editable text (for assistant: only dialogue part, not thought)
  const editableText = (message.role === "assistant" && parsed)
    ? parsed.content
    : message.content;

  // Hide the original dialogue element
  dialogueEl.style.display = "none";

  // Create inline editor container
  const editorWrapper = document.createElement("div");
  editorWrapper.className = "inline-edit-wrapper";

  const textarea = document.createElement("textarea");
  textarea.className = "inline-edit-textarea";
  textarea.value = editableText;
  textarea.rows = Math.max(3, (editableText.match(/\n/g) || []).length + 2);

  // Auto-resize on input
  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  });

  // Keyboard shortcuts: Ctrl+Enter to save, Escape to cancel
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  });

  const btnRow = document.createElement("div");
  btnRow.className = "inline-edit-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "inline-edit-save";
  saveBtn.innerHTML = "✓ Сохранить";
  saveBtn.title = "Сохранить (Ctrl+Enter)";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "inline-edit-cancel";
  cancelBtn.innerHTML = "✕ Отмена";
  cancelBtn.title = "Отмена (Escape)";

  const hint = document.createElement("span");
  hint.className = "inline-edit-hint";
  hint.textContent = "Ctrl+Enter — сохранить · Esc — отмена";

  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(hint);

  editorWrapper.appendChild(textarea);
  editorWrapper.appendChild(btnRow);

  // Insert after dialogueEl
  dialogueEl.parentNode.insertBefore(editorWrapper, dialogueEl.nextSibling);

  // Focus and position cursor at end
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  // Trigger initial auto-height
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";

  function saveEdit() {
    const newText = textarea.value;
    finishEdit();

    if (newText === editableText) return; // No changes

    let finalContent = newText;
    // For assistant messages, preserve the thought block
    if (message.role === "assistant" && parsed && parsed.thought) {
      finalContent = `<think>\n${parsed.thought}\n</think>\n${newText}`;
    }

    if (editMessageCallback) editMessageCallback(msgIndex, finalContent);
  }

  function cancelEdit() {
    finishEdit();
  }

  function finishEdit() {
    article.classList.remove("editing");
    dialogueEl.style.display = "";
    if (editorWrapper.parentNode) editorWrapper.parentNode.removeChild(editorWrapper);
  }

  saveBtn.addEventListener("click", (e) => { e.stopPropagation(); saveEdit(); });
  cancelBtn.addEventListener("click", (e) => { e.stopPropagation(); cancelEdit(); });
}

// --- UI Helpers ---

let statusTimeout = null;
export function setStatus(text, autoClear = true) {
  if (dom.statusText) {
    dom.statusText.textContent = text;
    // The badge is width-capped so it cannot push the character name out of the
    // header; keep the full text reachable on hover.
    dom.statusText.title = text || "";
    if (statusTimeout) {
      clearTimeout(statusTimeout);
      statusTimeout = null;
    }

    if (text) {
      dom.statusText.style.display = "inline-block";
      if (text.includes("429") || text.includes("Лимит") || text.includes("Повтор") || text.includes("Ошибка") || text.includes("Error")) {
        dom.statusText.classList.add("retry-active");
      } else {
        dom.statusText.classList.remove("retry-active");
        if (autoClear) {
          statusTimeout = setTimeout(() => {
            if (dom.statusText && !dom.statusText.classList.contains("retry-active")) {
              dom.statusText.textContent = "";
              dom.statusText.style.display = "none";
            }
          }, 3500);
        }
      }
    } else {
      dom.statusText.style.display = "none";
      dom.statusText.classList.remove("retry-active");
    }
  }
  console.log("Status:", text);
}

export function setApiStatus(text) {
  if (dom.apiStatusText) dom.apiStatusText.textContent = text;
  console.log("API Status:", text);
}

export function showStateNotification(text) {
  if (!dom.stateNotifications) return;
  const toast = document.createElement("div");
  toast.className = "state-notification";
  toast.textContent = text;
  dom.stateNotifications.appendChild(toast);
  
  toast.offsetHeight;
  toast.classList.add("visible");
  
  let removed = false;
  const removeToast = () => {
    if (removed) return;
    removed = true;
    toast.remove();
  };

  setTimeout(() => {
    toast.classList.remove("visible");
    toast.addEventListener("transitionend", removeToast);
    setTimeout(removeToast, 1000);
  }, 4000);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Grows the composer textarea to fit its content, between one line and the
 * CSS max-height (180px). Height is reset to "auto" first so scrollHeight
 * reflects the real content instead of the previously applied pixel height.
 *
 * Call this after any programmatic change to the composer's value: assigning
 * `.value` does not fire an `input` event, so the `input` listener alone will
 * not resize the box.
 */
/**
 * Two-letter initials for an avatar fallback, matching how the chat header
 * derives them.
 */
function initialsFor(name) {
  const clean = (name || "?").trim();
  return clean.slice(0, 2).toUpperCase() || "?";
}

/**
 * Small round portrait shown next to a message author. Uses the real avatar
 * when one is available and falls back to the same deterministic gradient +
 * initials the header uses, so the same person always looks the same.
 * A broken image URL swaps in the initials rather than leaving a broken glyph.
 */
function createMessageAvatar(name, imageSrc) {
  const wrap = document.createElement("span");
  wrap.className = "message-avatar";

  const addFallback = () => {
    if (wrap.querySelector(".message-avatar-initials")) return;
    const fallback = document.createElement("span");
    fallback.className = "message-avatar-initials";
    fallback.textContent = initialsFor(name);
    fallback.style.background = getAvatarStyleForName(name).gradient;
    wrap.appendChild(fallback);
  };

  if (imageSrc) {
    const img = document.createElement("img");
    img.className = "message-avatar-img";
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => {
      img.remove();
      addFallback();
    });
    img.src = imageSrc;
    wrap.appendChild(img);
  } else {
    addFallback();
  }

  return wrap;
}

/**
 * Resolves the avatar image for whoever is speaking on a message.
 * Characters are matched by speaker name; the user is represented by the
 * active persona.
 */
function avatarForSpeaker(speakerName, role) {
  if (role === "user") {
    const persona = getActivePersona();
    const src = persona?.avatarUrl || persona?.avatar || "";
    return { name: persona?.name || state.apiSettings?.userName || "User", src };
  }
  const speaker = speakerName
    ? state.characters.find(c => c.name && c.name.trim().toLowerCase() === speakerName.trim().toLowerCase())
    : null;
  const src = speaker?.avatar || speaker?.image || "";
  return { name: speakerName || "Assistant", src };
}

export function autoResizeComposer() {
  const input = dom.messageInput;
  if (!input) return;

  const MAX_HEIGHT = 180;
  input.style.height = "auto";
  const nextHeight = Math.min(input.scrollHeight, MAX_HEIGHT);
  input.style.height = `${nextHeight}px`;
  input.closest(".composer")?.classList.toggle("has-text", input.value.trim().length > 0);
  // only reveal a scrollbar once the cap is reached
  input.style.overflowY = input.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
}

export function formatMessageContent(rawText) {
  if (!rawText || !rawText.trim()) {
    return `<div class="typing-indicator">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>`;
  }

  // Remove strikethroughs (~~) and clean any legacy leaked HTML artifacts (like «dialogue"> or <span class="dialogue">)
  let cleanText = (rawText || "")
    .replace(/~~/g, "")
    .replace(/«\s*dialogue\s*">\s*/gi, "«")
    .replace(/<span\s+class=["']dialogue["']\s*>/gi, "")
    .replace(/<\/span>/gi, "");

  // Heal orphaned em-dashes broken across newlines:
  // e.g. "Quote"\n\n—\n\nlowercase narration -> "Quote" — lowercase narration
  cleanText = cleanText
    .replace(/([«"”'])\s*[\r\n]+\s*([—–])\s*[\r\n]+\s*([а-яa-zё])/gi, "$1 $2 $3")
    .replace(/[\r\n]+\s*([—–])\s*[\r\n]+\s*([а-яa-zё])/gi, " $1 $2")
    .replace(/([^\r\n]+)\s*[\r\n]+\s*([—–])\s*[\r\n]+/gi, "$1 $2 ")
    .replace(/([а-яa-zё0-9,])\s*[\r\n]+\s*([—–]\s+[А-ЯA-ZЁа-яa-zё])/g, "$1 $2");

  // Wrap quoted dialogue in <span class="dialogue"> for visual distinction.
  // Cleans any existing span wrappers first to avoid nesting or artifact leaks.
  function wrapDialogue(html) {
    if (!html) return "";
    let clean = html
      .replace(/<span\s+class=['"](?:dialogue|action|dialogue-line)['"]\s*>([\s\S]*?)<\/span>/gi, "$1")
      .replace(/<em\s+class=['"]action['"]\s*>([\s\S]*?)<\/em>/gi, "<em>$1</em>");

    // 1. Mark markdown asterisks *action* as <em class='action'>*action*</em>
    let processed = clean.replace(/<em>([\s\S]*?)<\/em>/gi, "<em class='action'>$1</em>");

    // 1.5. Mark thoughts ~thought~ as <span class='thought'>$1</span> (without capturing conversational tildes like 'hello~')
    processed = processed.replace(/(?<![~a-zA-Z0-9а-яА-ЯёЁ])~([^~\n\r<>]+?)~(?!~)/g, "<span class='thought'>$1</span>");

    // 2. Wrap quoted dialogue: «...», “...”, "...", &quot;...&quot;
    processed = processed
      .replace(/«([^»\n]+?)»/g, "<span class='dialogue'>«$1»</span>")
      .replace(/\u201c([^\u201d\n]+?)\u201d/g, "<span class='dialogue'>“$1”</span>")
      .replace(/&quot;([^&\n]+?)&quot;/g, "<span class='dialogue'>&quot;$1&quot;</span>")
      .replace(/(?<![=\w])"([^"\n]+?)"/g, "<span class='dialogue'>\"$1\"</span>");

    // 3. Only wrap em-dash line if it is GENUINE direct speech:
    // - Must start with dash followed by uppercase letter
    // - Must NOT be an incidental parenthetical clause (e.g. "— Кевин заметил — весьма...")
    // - Must NOT have quotation marks in the message (if quotes exist, quotes are the dialogue syntax)
    const hasQuotes = html.includes("&quot;") || html.includes("\"") || html.includes("«") || html.includes("“");
    if (!hasQuotes) {
      processed = processed.replace(/(<p[^>]*>)?\s*([—–]\s*[^<\n]+)(<\/p>)?/gi, (match, openP, text, closeP) => {
        if (text.includes("class='dialogue'") || text.includes("class=\"dialogue\"")) {
          return match;
        }
        const dashContent = text.replace(/^[—–]\s*/, "").trim();
        // If it contains a second em-dash, it is an incidental/parenthetical clause, NEVER a dialogue!
        if (dashContent.includes(" — ") || dashContent.includes(" – ")) {
          return match;
        }
        if (!dashContent || dashContent.length < 2) {
          return match;
        }
        const firstChar = dashContent.charAt(0);
        if (!/^[А-ЯA-ZЁ]/.test(firstChar)) {
          return match;
        }
        
        const pTagOpen = openP || "<p>";
        const pTagClose = closeP || "</p>";
        return `${pTagOpen}<span class='dialogue dialogue-line'>${text}</span>${pTagClose}`;
      });
    }

    // 4. CRITICAL SPLIT: If <em class='action'> is nested INSIDE <span class='dialogue'>,
    // split the dialogue span so action is NEVER rendered in dialogue color!
    processed = processed.replace(/<span class=['"]dialogue(?: dialogue-line)?['"]>([\s\S]*?)<\/span>/gi, (match, inner) => {
      if (!inner.includes("class='action'")) {
        return match;
      }
      const isLine = match.includes("dialogue-line");
      const spanClass = isLine ? "dialogue dialogue-line" : "dialogue";
      let parts = inner.split(/(<em class='action'>[\s\S]*?<\/em>)/gi);
      return parts.map(p => {
        if (p.includes("class='action'")) {
          return p;
        }
        if (p.trim()) {
          return `<span class='${spanClass}'>${p}</span>`;
        }
        return p;
      }).join("");
    });

    return processed;
  }

  if (window.marked && typeof window.marked.parse === 'function') {
    const parsedHtml = window.marked.parse(cleanText);
    return wrapDialogue(parsedHtml);
  }
  
  // Basic markdown fallback: replace *text* with <em>text</em>
  const escaped = escapeHtml(cleanText);
  let processedText = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  processedText = wrapDialogue(processedText);
  
  const lines = processedText.split(/\r?\n/);
  const blocks = [];
  let paragraph = [];
  let quote = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push(`<p>${paragraph.join("<br />")}</p>`);
    paragraph = [];
  }

  function flushQuote() {
    if (!quote.length) return;
    blocks.push(`<blockquote>${quote.join("<br />")}</blockquote>`);
    quote = [];
  }

  for (const line of lines) {
    const isQuote = line.trimStart().startsWith(">");
    if (isQuote) {
      flushParagraph();
      quote.push(line.replace(/^\s*>\s?/, ""));
      continue;
    }
    flushQuote();
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    paragraph.push(line);
  }

  flushQuote();
  flushParagraph();

  return blocks.length ? blocks.join("") : "<p></p>";
}

export function parseThoughtAndContent(text) {
  let thought = "";
  let content = text || "";

  if (!content) {
    return { thought: "", content: "" };
  }

  // 1. Check XML-style tags: <think>, <thought>, <thinking>, <reasoning>, <reflection>, <reflections>, <details>
  const xmlStartMatch = content.match(/<(thought|think|thinking|reasoning|reflection|reflections|details)\b[^>]*>/i);
  if (xmlStartMatch) {
    const tag = xmlStartMatch[1];
    const startIdx = xmlStartMatch.index + xmlStartMatch[0].length;
    const endRegex = new RegExp(`</${tag}\\s*>`, 'i');
    const endMatch = content.match(endRegex);
    if (endMatch) {
      const endIdx = endMatch.index;
      thought = content.substring(startIdx, endIdx);
      content = content.substring(endIdx + endMatch[0].length);
    } else {
      // Unclosed tag (streaming)
      thought = content.substring(startIdx);
      content = "";
    }
  } else {
    // 2. Check bracket-style tags: [THINK], [THOUGHT], [THINKING], [REASONING], [REFLECTION], [REFLECTIONS]
    const bracketStartMatch = content.match(/\[(thought|think|thinking|reasoning|reflection|reflections)\]/i);
    if (bracketStartMatch) {
      const tag = bracketStartMatch[1];
      const startIdx = bracketStartMatch.index + bracketStartMatch[0].length;
      const endRegex = new RegExp(`\\[\\/${tag}\\]`, 'i');
      const endMatch = content.match(endRegex);
      if (endMatch) {
        const endIdx = endMatch.index;
        thought = content.substring(startIdx, endIdx);
        content = content.substring(endIdx + endMatch[0].length);
      } else {
        // Unclosed tag (streaming)
        thought = content.substring(startIdx);
        content = "";
      }
    } else {
      // 3. Plain text / Markdown headers
      const plainMatch = content.match(/^(?:\*\*|\*|#{1,6}\s*)?(?:Thinking Process|Thought Process|Thought|Thinking|Reasoning|Reflection|Reflections|Размышления|Ход мыслей|Мысли)(?:\*\*|\*|:|\s*[:—-])\s*/i);
      if (plainMatch) {
        const headerLen = plainMatch[0].length;
        const rest = content.substring(headerLen);
        const splitIdx = rest.search(/\n\n+/);
        if (splitIdx !== -1) {
          thought = rest.substring(0, splitIdx);
          content = rest.substring(splitIdx).trim();
        } else {
          thought = rest;
          content = "";
        }
      }
    }
  }

  thought = thought.trim();
  if (thought.startsWith("```")) {
    thought = thought.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "");
  }
  
  content = content.trim();
  if (content.startsWith("```")) {
    content = content.replace(/^```[a-zA-Z]*\n?/, "");
  }
  if (content.endsWith("```")) {
    content = content.replace(/\n?```$/, "");
  }

  return { thought: thought.trim(), content: content.trim() };
}

export function updateHeaderStateBadge() {
  if (!dom.headerStateBadge || !dom.headerStateBadgeText) return;
  const character = getActiveCharacter();
  if (!character) {
    dom.headerStateBadge.style.display = "none";
    dom.headerStateBadge.removeAttribute("data-active");
    return;
  }
  const states = getChatStates(character.id) || {};
  const entries = Object.entries(states).filter(([k, v]) => {
    if (["eventLog", "statusConditions", "lastUpdated"].includes(k)) return false;
    if (v === null || v === undefined) return false;
    const str = String(typeof v === "object" ? "" : v).trim();
    return str.length > 0 && str !== "Не определено" && str !== "undefined" && str !== "[object Object]";
  });
  if (entries.length === 0) {
    dom.headerStateBadge.style.display = "none";
    dom.headerStateBadge.removeAttribute("data-active");
    return;
  }
  // Try to find location or mood, or take the first state entry
  const locEntry = entries.find(([k]) => /локация|место|location|place/i.test(k));
  const moodEntry = entries.find(([k]) => /настроение|mood/i.test(k));
  const chosen = locEntry || moodEntry || entries[0];
  const [key, val] = chosen;
  const valStr = String(val).trim();
  if (!valStr || valStr === "Не определено") {
    dom.headerStateBadge.style.display = "none";
    dom.headerStateBadge.removeAttribute("data-active");
    return;
  }

  const iconEl = dom.headerStateBadge.querySelector(".header-state-badge-icon");
  if (iconEl) {
    iconEl.textContent = locEntry ? "📍" : (moodEntry ? "💭" : "✨");
  }
  dom.headerStateBadgeText.textContent = valStr;
  dom.headerStateBadge.title = `Состояние: ${key} = ${valStr} (нажмите для подробностей)`;
  dom.headerStateBadge.style.display = "inline-flex";
  dom.headerStateBadge.setAttribute("data-active", "true");
}

// --- Render Core Functions ---

export function renderProgressBar() {
  updateHeaderStateBadge();
  const character = getActiveCharacter();
  if (!character) {
    if (dom.customStatesPanel) dom.customStatesPanel.innerHTML = "";
    if (dom.statusConditionsPanel) dom.statusConditionsPanel.innerHTML = "";
    return;
  }

  const states = getChatStates(character.id);

  if (dom.customStatesPanel) {
    dom.customStatesPanel.innerHTML = "";
    const excludeKeys = ["affinity", "trust", "mood", "relationshipStage", "eventLog", "statusConditions"];
    const customEntries = Object.entries(states).filter(([k]) => !excludeKeys.includes(k));
    
    if (customEntries.length > 0) {
      customEntries.forEach(([key, val]) => {
        const type = getStateType(key, state.customStateTypes);
        
        if (type === "number") {
          const card = document.createElement("div");
          
          const coreStateConf = (character.coreStates || []).find(cs => cs.key === key);
          const displayName = coreStateConf ? coreStateConf.displayName : key.replace(/_/g, " ");
          const color = coreStateConf ? (coreStateConf.color || "purple") : "purple";
          
          card.className = `custom-state-card state-card-${color}`;
          
          const stages = getStagesForState(character.id, key);
          const generatingKey = `${character.id}_${key}`;
          const numericVal = parseNumericStateValue(val, stages);
          
          if (stages && stages.length === 6) {
            const currentStageIdx = getStageIndexForValue(numericVal);
            const currentStageName = stages[currentStageIdx];
            
            const header = document.createElement("div");
            header.className = "card-header";
            header.innerHTML = `<span class="card-title" title="${escapeHtml(key)}">${escapeHtml(displayName)}</span><span class="card-value">${Math.round(numericVal)}%</span>`;
            card.appendChild(header);
            
            const stageNameDiv = document.createElement("div");
            stageNameDiv.className = "card-stage-name";
            stageNameDiv.textContent = currentStageName;
            card.appendChild(stageNameDiv);
            
            const prog = document.createElement("div");
            prog.className = "segmented-progress";
            for (let i = 1; i <= 6; i++) {
              const seg = document.createElement("div");
              seg.className = "segment-bar";
              if (i <= currentStageIdx + 1) {
                seg.classList.add("active", `seg-${i}`);
              }
              seg.title = `Этап ${i}: ${stages[i - 1]}`;
              prog.appendChild(seg);
            }
            card.appendChild(prog);
          } else {
            const header = document.createElement("div");
            header.className = "card-header";
            header.innerHTML = `<span class="card-title" title="${escapeHtml(key)}">${escapeHtml(displayName)}</span><span class="card-value">${Math.round(numericVal)}%</span>`;
            card.appendChild(header);
            
            const stageNameDiv = document.createElement("div");
            stageNameDiv.className = "card-stage-name";
            stageNameDiv.innerHTML = `<span class="state-loading-spinner"></span>Генерация...`;
            card.appendChild(stageNameDiv);
            
            if (!state.generatingStages[generatingKey] && triggerStageGenCallback) {
              triggerStageGenCallback(character, key);
            }
          }
          
          dom.customStatesPanel.appendChild(card);
        } else if (type === "boolean") {
          const tag = document.createElement("span");
          tag.className = "state-tag";
          const boolVal = val === true || val === "true";
          tag.innerHTML = `<span class="tag-key">${escapeHtml(key)}:</span> <span class="tag-value" style="color: ${boolVal ? '#ffffff' : '#e05555'}">${boolVal ? '✓ true' : '✗ false'}</span>`;
          dom.customStatesPanel.appendChild(tag);
        } else {
          const tag = document.createElement("span");
          tag.className = "state-tag";
          tag.innerHTML = `<span class="tag-key">${escapeHtml(key)}:</span> <span class="tag-value">${escapeHtml(val)}</span>`;
          dom.customStatesPanel.appendChild(tag);
        }
      });
    }
  }

  // --- Render Status Conditions Panel ---
  if (dom.statusConditionsPanel) {
    dom.statusConditionsPanel.innerHTML = "";
    
    const activeChatId = getActiveChatId(character.id);
    const chatMeta = (state.chatMetadata[character.id] || []).find(c => c.id === activeChatId);
    const isDuo = chatMeta && isDuoChat(chatMeta);
    
    // Create title
    const title = document.createElement("h5");
    title.className = "status-conditions-title";
    title.textContent = "Active States / Состояния";
    dom.statusConditionsPanel.appendChild(title);
    
    // Group of characters to show
    const charactersToShow = [];
    if (isDuo && chatMeta) {
      const char1 = character;
      const char2 = state.characters.find(c => c.id === chatMeta.secondaryCharacterId);
      if (char1) charactersToShow.push(char1);
      if (char2) charactersToShow.push(char2);
    } else {
      charactersToShow.push(character);
    }
    
    charactersToShow.forEach(char => {
      const group = document.createElement("div");
      group.className = "condition-char-group";
      
      const header = document.createElement("div");
      header.className = "condition-char-header";
      header.innerHTML = `<span>${escapeHtml(char.name)}</span>`;
      
      // Add Condition Button
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "add-condition-btn";
      addBtn.innerHTML = '<svg class="feather" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Add';
      addBtn.addEventListener("click", () => {
        const cond = prompt(`Add status condition for ${char.name} (e.g. Крепко спит, Опьянен):`);
        if (cond && cond.trim() && addStatusConditionCallback) {
          addStatusConditionCallback(char.id, cond.trim());
        }
      });
      header.appendChild(addBtn);
      group.appendChild(header);
      
      const tagsList = document.createElement("div");
      tagsList.className = "condition-tags-list";
      
      // Load current conditions
      const chatStates = getChatStates(activeChatId);
      const activeConditions = (chatStates.statusConditions && chatStates.statusConditions[char.id]) || [];
      
      if (activeConditions.length > 0) {
        activeConditions.forEach(cond => {
          const tag = document.createElement("span");
          tag.className = "state-tag condition-tag";
          tag.innerHTML = `${escapeHtml(cond)}`;
          
          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "remove-btn";
          removeBtn.innerHTML = "&times;";
          removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (removeStatusConditionCallback) {
              removeStatusConditionCallback(char.id, cond);
            }
          });
          tag.appendChild(removeBtn);
          tagsList.appendChild(tag);
        });
      } else {
        const emptySpan = document.createElement("span");
        emptySpan.className = "empty-conditions-text";
        emptySpan.textContent = "No active conditions / Нет состояний";
        tagsList.appendChild(emptySpan);
      }
      
      group.appendChild(tagsList);
      dom.statusConditionsPanel.appendChild(group);
    });
  }
}

export function renderMoodIndicator() {
  const character = getActiveCharacter();
  if (!character) {
    if (dom.moodIndicator) dom.moodIndicator.textContent = "";
    if (dom.moodSelect) dom.moodSelect.value = "neutral";
    return;
  }

  const states = getChatStates(character.id);
  const mood = states.mood || "neutral";

  if (dom.moodIndicator) {
    dom.moodIndicator.textContent = MOOD_EMOJIS[mood] || "😐";
  }
  if (dom.moodSelect) {
    dom.moodSelect.value = mood;
  }
}

export function renderStates() {
  const character = getActiveCharacter();
  if (dom.stateList) dom.stateList.innerHTML = "";
  if (!character) return;

  const excludeKeys = ["affinity", "trust", "mood", "relationshipStage", "eventLog", "statusConditions"];
  const entries = Object.entries(getChatStates(character.id)).filter(([key]) => !excludeKeys.includes(key));
  
  if (!entries.length) {
    const li = document.createElement("li");
    li.className = "state-list-empty";
    li.textContent = "No custom states yet. The AI will create them as your story develops.";
    dom.stateList.appendChild(li);
    return;
  }
  
  for (const [key, value] of entries) {
    const type = getStateType(key, state.customStateTypes);
    const li = document.createElement("li");
    li.className = "state-list-item";

    const row = document.createElement("div");
    row.className = "state-row";

    const header = document.createElement("div");
    header.className = "state-row-header";

    const keyLabel = document.createElement("span");
    keyLabel.className = "state-key-label";
    keyLabel.textContent = key.replace(/_/g, " ");

    const typeBadge = document.createElement("span");
    typeBadge.className = `state-type-badge type-${type}`;
    typeBadge.textContent = type;

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "\u2715";
    deleteBtn.title = `Remove "${key}"`;
    deleteBtn.className = "state-delete-btn";
    deleteBtn.addEventListener("click", () => {
      const activeChatId = getActiveCharacter() ? getActiveChatId(getActiveCharacter().id) : character.id;
      const currentValue = getChatStates(activeChatId)[key];
      const next = { ...getChatStates(activeChatId) };
      delete next[key];
      state.chatStates = { ...state.chatStates, [activeChatId]: next };
      pushAction("state_delete", { characterId: activeChatId, key, value: currentValue }, { action: "state_add", key });
      saveChatStates(state.chatStates);
      renderStates();
      renderProgressBar();
      setStatus(`State "${key}" removed.`);
    });

    header.appendChild(keyLabel);
    header.appendChild(typeBadge);
    header.appendChild(deleteBtn);
    row.appendChild(header);

    if (type === "number") {
      const stages = getStagesForState(character.id, key);
      const numVal = parseNumericStateValue(value, stages);
      const generatingKey = `${character.id}_${key}`;
      
      const container = document.createElement("div");
      container.className = "state-container";
      
      if (stages && stages.length === 6) {
        const currentStageIdx = getStageIndexForValue(numVal);
        const currentStageName = stages[currentStageIdx];
        
        const stageLabel = document.createElement("span");
        stageLabel.className = "state-stage-label";
        stageLabel.textContent = `${currentStageName} (${numVal}%)`;
        container.appendChild(stageLabel);
        
        const prog = document.createElement("div");
        prog.className = "segmented-progress";
        for (let i = 1; i <= 6; i++) {
          const seg = document.createElement("div");
          seg.className = "segment-bar";
          if (i <= currentStageIdx + 1) {
            seg.classList.add("active", `seg-${i}`);
          }
          seg.title = `Этап ${i}: ${stages[i - 1]}`;
          prog.appendChild(seg);
        }
        container.appendChild(prog);
      } else {
        const barWrap = document.createElement("div");
        barWrap.className = "state-bar-wrap";
        
        if (state.generatingStages[generatingKey]) {
          const spinner = document.createElement("span");
          spinner.className = "state-loading-spinner";
          const loadingText = document.createElement("span");
          loadingText.className = "state-loading-text";
          loadingText.textContent = "Генерация этапов...";
          barWrap.appendChild(spinner);
          barWrap.appendChild(loadingText);
        } else {
          const bar = document.createElement("div");
          bar.className = "state-progress-bar";
          const fill = document.createElement("div");
          fill.className = "state-progress-fill";
          fill.style.width = `${numVal}%`;
          bar.appendChild(fill);
          const valLabel = document.createElement("span");
          valLabel.className = "state-value-label";
          valLabel.textContent = `${numVal}%`;
          barWrap.appendChild(bar);
          barWrap.appendChild(valLabel);
          
          if (triggerStageGenCallback) {
            triggerStageGenCallback(character, key);
          }
        }
        container.appendChild(barWrap);
      }
      row.appendChild(container);
    } else if (type === "boolean") {
      const boolVal = value === true || value === "true";
      const badge = document.createElement("span");
      badge.className = `state-boolean-badge ${boolVal ? "true" : "false"}`;
      badge.textContent = boolVal ? "\u2713 true" : "\u2717 false";
      row.appendChild(badge);
    } else {
      const valSpan = document.createElement("span");
      valSpan.className = "state-string-value";
      valSpan.title = String(value);
      valSpan.textContent = String(value);
      row.appendChild(valSpan);
    }

    li.appendChild(row);
    dom.stateList.appendChild(li);
  }
}

export function renderStateProposals() {
  const character = getActiveCharacter();
  if (dom.stateProposalList) dom.stateProposalList.innerHTML = "";
  if (!character) return;
  const activeChatId = getActiveChatId(character.id);
  const proposals = state.pendingStateProposals[activeChatId] || [];
  if (!proposals.length) {
    const li = document.createElement("li");
    li.textContent = "No pending suggestions.";
    dom.stateProposalList.appendChild(li);
    return;
  }

  proposals.forEach((proposal, index) => {
    const li = document.createElement("li");
    const row = document.createElement("div");
    row.className = "proposal-row";
    const text = document.createElement("span");
    text.textContent = `${proposal.key} -> ${proposal.value}${proposal.reason ? ` (${proposal.reason})` : ""}`;
    const actions = document.createElement("div");
    actions.className = "mini-actions";

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.textContent = "Apply";
    applyBtn.addEventListener("click", () => {
      if (applyProposalCallback) {
        applyProposalCallback(index, proposal);
      }
    });

    const dismissBtn = document.createElement("button");
    dismissBtn.type = "button";
    dismissBtn.textContent = "Dismiss";
    dismissBtn.addEventListener("click", () => {
      if (dismissProposalCallback) {
        dismissProposalCallback(index, proposal);
      }
    });

    actions.appendChild(applyBtn);
    actions.appendChild(dismissBtn);
    row.appendChild(text);
    row.appendChild(actions);
    li.appendChild(row);
    dom.stateProposalList.appendChild(li);
  });
}

export function renderEventLog() {
  const character = getActiveCharacter();
  if (!dom.eventLogList) return;
  
  dom.eventLogList.innerHTML = "";
  if (!character) return;
  
  const states = getChatStates(character.id);
  const logs = states.eventLog || [];
  
  if (logs.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-log-item";
    li.textContent = "No event history yet.";
    dom.eventLogList.appendChild(li);
    return;
  }
  
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i];
    const li = document.createElement("li");
    
    const timeSpan = document.createElement("span");
    timeSpan.className = "timestamp";
    timeSpan.textContent = `[${log.timestamp}]`;
    
    const textNode = document.createTextNode(log.message);
    li.appendChild(timeSpan);
    
    let msg = log.message;
    const match = msg.match(/(AFFINITY|TRUST|MOOD|STAGE) (?:updated|changed|set|added):?\s*([+-]?\d+|"[^"]+"|\w+)/i);
    if (match) {
      const change = match[2];
      let idxOfChange = msg.indexOf(change);
      if (idxOfChange !== -1) {
        let before = msg.substring(0, idxOfChange);
        let after = msg.substring(idxOfChange + change.length);
        
        const changeSpan = document.createElement("span");
        changeSpan.className = "metric-change";
        if (change.startsWith("+")) {
          changeSpan.classList.add("positive");
        } else if (change.startsWith("-")) {
          changeSpan.classList.add("negative");
        }
        changeSpan.textContent = change;
        
        li.appendChild(document.createTextNode(before));
        li.appendChild(changeSpan);
        li.appendChild(document.createTextNode(after));
      } else {
        li.appendChild(textNode);
      }
    } else {
      li.appendChild(textNode);
    }
    
    dom.eventLogList.appendChild(li);
  }
}

export function renderChatSelector() {
  const isGmTab = state.sidebarTab === "gm";
  const activeId = isGmTab ? state.activeGmSceneId : state.activeCharacterId;
  
  if (!activeId) {
    if (dom.chatSelectorContainer) dom.chatSelectorContainer.style.display = "none";
    return;
  }

  if (dom.chatSelectorContainer) dom.chatSelectorContainer.style.display = "flex";
  if (!dom.chatSelector) return;

  dom.chatSelector.innerHTML = "";
  const chats = state.chatMetadata[activeId] || [];
  const activeChatId = getActiveChatId(activeId);
  let isActiveDuo = false;
  let bothSpeak = true;

  chats.forEach((chat) => {
    const option = document.createElement("option");
    option.value = chat.id;
    option.textContent = chat.name;
    if (chat.id === activeChatId) {
      option.selected = true;
      isActiveDuo = chat.type === "duo";
      bothSpeak = chat.bothSpeak !== false;
    }
    dom.chatSelector.appendChild(option);
  });

  if (dom.duoModeToggle) {
    dom.duoModeToggle.style.display = (!isGmTab && isActiveDuo) ? "flex" : "none";
  }
  if (dom.duoBothSpeakToggle) {
    dom.duoBothSpeakToggle.checked = bothSpeak;
  }
  if (dom.duoBothSpeakLabel) {
    dom.duoBothSpeakLabel.textContent = bothSpeak ? "Both" : "Auto";
  }
}

export function renderCharacters() {
  if (selectCharacterCallback) {
    selectCharacterCallback(null, true);
  }
  dom.characterList.innerHTML = "";
  const query = (state.charQuery || "").toLowerCase();
  const list = state.characters.filter((character) => {
    if (!query) return true;
    const hay = `${character.name} ${character.description} ${character.scenario} ${character.personality}`.toLowerCase();
    return hay.includes(query);
  });
  for (const character of list) {
    const li = document.createElement("li");
    if (character.id === state.activeCharacterId) {
      li.className = "active";
    }
    
    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = "select-btn";
    const avatarSrc = character.avatar || character.image || "";
    const initials = (character.name || "?").trim().slice(0, 2).toUpperCase();
    const avatarHtml = avatarSrc
      ? `<div class="char-avatar-wrap"><img src="${escapeHtml(avatarSrc)}" class="char-avatar-img" alt="${escapeHtml(character.name)}" /><span class="char-online-dot"></span></div>`
      : `<div class="char-avatar-wrap"><div class="char-avatar-fallback">${escapeHtml(initials)}</div><span class="char-online-dot"></span></div>`;

    selectBtn.innerHTML = `
      ${avatarHtml}
      <div class="char-info-col">
        <div class="char-name">${escapeHtml(character.name)}</div>
        ${character.description ? `<div class="char-desc">${escapeHtml(character.description)}</div>` : ""}
      </div>
    `;
    selectBtn.addEventListener("click", () => {
      if (selectCharacterCallback) selectCharacterCallback(character.id);
    });
    
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "edit-btn";
    editBtn.title = `Edit ${character.name}`;
    editBtn.innerHTML = '<svg class="feather" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>';
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      selectAdminCharacter(character.id);
      dom.adminDialog.showModal();
    });
    
    li.appendChild(selectBtn);
    li.appendChild(editBtn);
    dom.characterList.appendChild(li);
  }
}

let selectGmSceneCallback = null;
export function onSelectGmScene(callback) {
  selectGmSceneCallback = callback;
}

let editGmSceneCallback = null;
export function onEditGmScene(callback) {
  editGmSceneCallback = callback;
}

export function renderGmScenes() {
  if (!dom.gmSceneList) return;
  dom.gmSceneList.innerHTML = "";
  
  const query = String(dom.gmSceneSearchInput?.value || "").toLowerCase();
  const list = state.gmScenes.filter((scene) => {
    if (!query) return true;
    const hay = `${scene.name} ${scene.gmSystemPrompt}`.toLowerCase();
    return hay.includes(query);
  });
  
  for (const scene of list) {
    const li = document.createElement("li");
    if (scene.id === state.activeGmSceneId) {
      li.className = "active";
    }
    
    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = "select-btn";
    const npcNames = (scene.participants || []).map(p => p.name).join(", ");
    selectBtn.innerHTML = `
      <div class="char-avatar-wrap"><div class="char-avatar-fallback gm-fallback">🎭</div></div>
      <div class="char-info-col">
        <div class="char-name">${escapeHtml(scene.name)}</div>
        <div class="char-desc" style="font-size: 11px; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">NPCs: ${escapeHtml(npcNames || "None")}</div>
      </div>
    `;
    selectBtn.addEventListener("click", () => {
      if (selectGmSceneCallback) selectGmSceneCallback(scene.id);
    });
    
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "edit-btn";
    editBtn.title = `Edit ${scene.name}`;
    editBtn.innerHTML = '<svg class="feather" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>';
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (editGmSceneCallback) editGmSceneCallback(scene.id);
    });
    
    li.appendChild(selectBtn);
    li.appendChild(editBtn);
    dom.gmSceneList.appendChild(li);
  }
}

export function switchSidebarTab(tab) {
  state.sidebarTab = tab;
  
  if (tab === "gm") {
    if (dom.charactersSection) dom.charactersSection.style.display = "none";
    if (dom.gmScenesSection) dom.gmScenesSection.style.display = "flex";
    if (dom.tabCharactersBtn) dom.tabCharactersBtn.classList.remove("active");
    if (dom.tabGmScenesBtn) dom.tabGmScenesBtn.classList.add("active");
  } else {
    if (dom.charactersSection) dom.charactersSection.style.display = "flex";
    if (dom.gmScenesSection) dom.gmScenesSection.style.display = "none";
    if (dom.tabCharactersBtn) dom.tabCharactersBtn.classList.add("active");
    if (dom.tabGmScenesBtn) dom.tabGmScenesBtn.classList.remove("active");
  }
  
  renderChatSelector();
}

export function switchRightSidebarTab(tabName) {
  if (!dom.sidebarRightTabs) return;
  const buttons = dom.sidebarRightTabs.querySelectorAll(".sidebar-tab-btn");
  buttons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  const panes = {
    memory: dom.rightTabContentMemory,
    character: dom.rightTabContentCharacter,
    stats: dom.rightTabContentStats,
  };

  Object.entries(panes).forEach(([key, pane]) => {
    if (pane) {
      if (key === tabName) {
        pane.style.display = "flex";
        pane.classList.add("active");
      } else {
        pane.style.display = "none";
        pane.classList.remove("active");
      }
    }
  });

  try {
    localStorage.setItem("active_right_sidebar_tab", tabName);
  } catch (_) {}
}

export function switchSettingsTab(tabName) {
  const dialog = document.getElementById("settingsDialog");
  if (!dialog) return;

  const buttons = dialog.querySelectorAll(".settings-tab-btn");
  buttons.forEach(btn => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  const panes = {
    "tab-api": document.getElementById("settingsTabApi"),
    "tab-generation": document.getElementById("settingsTabGen"),
    "tab-setting": document.getElementById("settingsTabSetting"),
    "tab-appearance": document.getElementById("settingsTabAppearance")
  };

  Object.entries(panes).forEach(([key, pane]) => {
    if (pane) {
      if (key === tabName) {
        pane.style.display = "block";
        pane.classList.add("active");
      } else {
        pane.style.display = "none";
        pane.classList.remove("active");
      }
    }
  });

  try {
    localStorage.setItem("active_settings_tab", tabName);
  } catch (_) {}
}

export function initSettingsTabs() {
  const dialog = document.getElementById("settingsDialog");
  if (!dialog) return;

  const buttons = dialog.querySelectorAll(".settings-tab-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const targetTab = btn.dataset.tab;
      if (targetTab) {
        switchSettingsTab(targetTab);
      }
    });
  });

  // Restore active tab or default to tab-api
  let savedTab = "tab-api";
  try {
    const s = localStorage.getItem("active_settings_tab");
    if (s && (s === "tab-api" || s === "tab-generation" || s === "tab-setting" || s === "tab-appearance")) {
      savedTab = s;
    }
  } catch (_) {}
  switchSettingsTab(savedTab);
}

let renderMessagesTimeout = null;
let renderMessagesPending = false;
let lastRenderedChatLength = -1;
let lastRenderedChatId = null;

/** Distance from the bottom, in px, under which we consider the user "at the bottom". */
const SCROLL_BOTTOM_THRESHOLD = 180;

function isScrolledToBottom() {
  const el = dom.messages;
  if (!el) return true;
  return (el.scrollHeight - el.scrollTop - el.clientHeight) < SCROLL_BOTTOM_THRESHOLD;
}

/**
 * Snapshot of the scroll state before the message list is rebuilt. A full
 * rebuild used to unconditionally jump to the bottom, so toggling a reaction,
 * deleting a message or undoing an action yanked the user away from whatever
 * history they were reading.
 */
function captureMessagesScroll() {
  const el = dom.messages;
  if (!el) return null;
  const firstArticle = el.querySelector("article.message");
  return {
    wasNearBottom: (el.scrollHeight - el.scrollTop - el.clientHeight) < SCROLL_BOTTOM_THRESHOLD,
    distanceFromBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
    // Viewport offset of the first rendered article: the anchor we restore to
    // after a rebuild, so prepending rows do not push the view around.
    firstArticleTop: firstArticle ? firstArticle.getBoundingClientRect().top : null
  };
}

/**
 * Restore the scroll position captured before the rebuild. Anchors on the
 * first article when possible, so prepending (load earlier), appending
 * (streaming) and removing rows all keep the reader's place.
 */
function restoreMessagesScroll(previous) {
  const el = dom.messages;
  if (!el || !previous) return;

  if (previous.wasNearBottom && !isLoadingEarlier) {
    el.scrollTop = el.scrollHeight;
    return;
  }

  const firstArticle = el.querySelector("article.message");
  if (previous.firstArticleTop !== null && firstArticle) {
    const delta = firstArticle.getBoundingClientRect().top - previous.firstArticleTop;
    el.scrollTop = Math.max(0, el.scrollTop + delta);
    return;
  }

  el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - previous.distanceFromBottom);
}

export function renderMessagesThrottled() {
  if (renderMessagesPending) return;
  renderMessagesPending = true;
  renderMessagesTimeout = requestAnimationFrame(() => {
    try {
      renderMessages();
    } catch (err) {
      console.error("[renderMessagesThrottled] Render error:", err);
    } finally {
      renderMessagesTimeout = null;
      renderMessagesPending = false;
    }
  });
}

function updateLastArticleContent(lastArticle, lastMessage) {
  const body = lastArticle.querySelector(".message-body");
  if (!body) return;
  const parsed = parseThoughtAndContent(lastMessage.content);
  let thoughtEl = body.querySelector(".message-thought");
  
  const displayMode = state.apiSettings?.thinkingDisplay || (state.apiSettings?.enableInnerMonologue === false ? "hidden" : "collapsed");
  const isRu = (state.apiSettings?.chatLanguage || "ru") === "ru";

  if (displayMode === "hidden") {
    if (thoughtEl) thoughtEl.remove();
  } else if (parsed.thought) {
    if (!thoughtEl) {
      thoughtEl = document.createElement("div");
      thoughtEl.className = "message-thought collapsed";
      const header = document.createElement("div");
      header.className = "thought-header";
      header.innerHTML = `💭 <span class="thought-title">${isRu ? "Размышления" : "Inner Monologue"}</span> <span class="thought-toggle-icon">▼</span>`;
      header.addEventListener("click", (e) => { 
        e.stopPropagation(); 
        thoughtEl.classList.toggle("collapsed"); 
      });
      const thoughtText = document.createElement("div");
      thoughtText.className = "thought-text";
      thoughtEl.appendChild(header);
      thoughtEl.appendChild(thoughtText);
      body.insertBefore(thoughtEl, body.firstChild);
    }

    const header = thoughtEl.querySelector(".thought-header");
    if (displayMode === "live" && state.isStreaming && !parsed.content) {
      thoughtEl.classList.remove("collapsed");
      thoughtEl.classList.add("streaming-thought");
      if (header) {
        header.innerHTML = `💭 <span class="thought-title">${isRu ? "Размышляет..." : "Thinking..."}</span><span class="thought-pulsing-dot"></span> <span class="thought-toggle-icon">▼</span>`;
      }
    } else {
      if (state.isStreaming && !parsed.content) {
        thoughtEl.classList.add("streaming-thought");
        if (header) {
          header.innerHTML = `💭 <span class="thought-title">${isRu ? "Размышляет..." : "Thinking..."}</span><span class="thought-pulsing-dot"></span> <span class="thought-toggle-icon">▼</span>`;
        }
      } else {
        thoughtEl.classList.remove("streaming-thought");
        if (header) {
          header.innerHTML = `💭 <span class="thought-title">${isRu ? "Размышления" : "Inner Monologue"}</span> <span class="thought-toggle-icon">▼</span>`;
        }
      }
    }

    const tt = thoughtEl.querySelector(".thought-text");
    if (tt) tt.innerHTML = formatMessageContent(parsed.thought);
  } else if (thoughtEl) {
    thoughtEl.remove();
  }

  let dialogueEl = body.querySelector(".message-dialogue");
  if (!dialogueEl) {
    dialogueEl = document.createElement("div");
    dialogueEl.className = "message-dialogue";
    const msgIndex = Number(lastArticle.dataset.index);
    dialogueEl.addEventListener("dblclick", (e) => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) return;
      e.stopPropagation();
      startInlineEdit(lastArticle, msgIndex, lastMessage, dialogueEl, parsed);
    });
    body.appendChild(dialogueEl);
  }

  if (lastMessage.isGmMessage) {
    const gmBlocks = parseGmMessage(parsed.content);
    if (gmBlocks.length === 0) {
      dialogueEl.innerHTML = `
        <div class="gm-narrator-card gm-loading-card">
          <div class="gm-narrator-header">
            <span class="gm-narrator-icon">🎭</span>
            <span class="gm-narrator-title">ГЕЙМ-МАСТЕР ОПИСЫВАЕТ СОБЫТИЯ...</span>
          </div>
          <div class="gm-narrator-text">
            <div class="typing-indicator">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          </div>
        </div>
      `;
    } else {
      dialogueEl.innerHTML = "";
      gmBlocks.forEach((block) => {
        dialogueEl.appendChild(createGmBlockElement(block));
      });
    }
  } else {
    if (!parsed.content && state.isStreaming) {
      dialogueEl.innerHTML = `
        <div class="typing-indicator">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      `;
    } else {
      dialogueEl.innerHTML = formatMessageContent(parsed.content);
    }
  }

  let evaluatorEl = body.querySelector(".message-evaluator-spoiler");
  if (lastMessage.evaluatorData) {
    const newEvaluatorEl = createEvaluatorSpoilerElement(lastMessage.evaluatorData, Number(lastArticle.dataset.index));
    if (newEvaluatorEl) {
      if (evaluatorEl) {
        evaluatorEl.replaceWith(newEvaluatorEl);
      } else {
        const timestampEl = body.querySelector(".message-timestamp");
        if (timestampEl) {
          body.insertBefore(newEvaluatorEl, timestampEl);
        } else {
          body.appendChild(newEvaluatorEl);
        }
      }
    }
  } else if (evaluatorEl) {
    evaluatorEl.remove();
  }
}

export function renderPlotStarterEmptyState(character) {
  if (!dom.messages) return;
  
  const isGm = state.sidebarTab === "gm" || (!character && Boolean(state.activeGmSceneId));
  const container = document.createElement("div");
  container.className = "plot-starter-container";

  if (isGm) {
    const scene = state.gmScenes.find(s => s.id === state.activeGmSceneId);
    const sceneName = scene?.name || "Безымянная сцена";
    const scenario = scene?.scenario || "Завязка сцены ещё не описана. Настройте сюжет в параметрах сцены или начните диалог прямо сейчас.";
    const npcs = scene?.participants || [];

    let npcListHtml = "";
    if (npcs.length > 0) {
      npcListHtml = npcs.map(npc => {
        const style = getAvatarStyleForName(npc.name);
        const avatarContent = style.imageHtml ? style.imageHtml : style.initials;
        return `
          <div class="gm-empty-npc-pill">
            <span class="pill-avatar" style="background: ${style.gradient}">${avatarContent}</span>
            <div class="pill-info">
              <strong class="pill-name">${escapeHtml(npc.name)}</strong>
              <span class="pill-desc">${escapeHtml(npc.speech || npc.personality || "Участник сцены")}</span>
            </div>
          </div>
        `;
      }).join("");
    } else {
      npcListHtml = `<div class="gm-empty-no-npcs">В этой сцене пока нет NPC. Вы можете добавить их через кнопку настроек в шапке.</div>`;
    }

    container.innerHTML = `
      <div class="plot-starter-card gm-empty-starter-card">
        <div class="plot-starter-header">
          <div class="plot-starter-icon gm-icon-glow">🎭</div>
          <div class="plot-starter-info">
            <h3 class="plot-starter-title">Сцена: ${escapeHtml(sceneName)}</h3>
            <p class="plot-starter-subtitle">Гейм-Мастер отыгрывает всех участников и описание событий</p>
          </div>
        </div>

        <div class="plot-starter-scenario-box gm-scenario-card">
          <div class="gm-scenario-heading">📍 Обстановка и завязка:</div>
          <div class="gm-scenario-body">${escapeHtml(scenario)}</div>
        </div>

        <div class="gm-empty-participants-box">
          <div class="gm-participants-heading">👥 Персонажи в локации (${npcs.length}):</div>
          <div class="gm-empty-npc-grid">
            ${npcListHtml}
          </div>
        </div>

        <div class="plot-starter-actions">
          <button type="button" class="plot-action-btn primary" id="plotStarterWriteUserBtn">
            <span class="btn-emoji">✍️</span>
            <div class="btn-text-group">
              <strong>Сделать первый ход (Действие игрока)</strong>
              <span>Опишите появление или действие вашего персонажа</span>
            </div>
          </button>

          <button type="button" class="plot-action-btn secondary" id="plotStarterTriggerAssistantBtn">
            <span class="btn-emoji">🎲</span>
            <div class="btn-text-group">
              <strong>Вводная от Ведущего (GM Opening)</strong>
              <span>Пусть Мастер первым опишет обстановку и завязку сцены</span>
            </div>
          </button>
        </div>

        <div class="plot-suggestions-section">
          <span class="suggestions-heading">💡 Заготовки для старта сцены:</span>
          <div class="plot-chips-grid">
            <button type="button" class="plot-chip-btn" data-prompt="*Я неспешно захожу в локацию, осматриваясь по сторонам, и привлекаю к себе внимание:*">«*Я неспешно захожу в локацию...*»</button>
            <button type="button" class="plot-chip-btn" data-prompt="*Я молча наблюдаю за происходящим из тени, стараясь не выдавать своего присутствия.*">«*Я наблюдаю из тени...*»</button>
            <button type="button" class="plot-chip-btn" data-prompt="[GM: Опиши подробно текущую обстановку, кто чем занят и что происходит прямо сейчас.]">«[GM: Опиши обстановку...]»</button>
          </div>
        </div>
      </div>
    `;

    dom.messages.appendChild(container);

    const writeBtn = container.querySelector("#plotStarterWriteUserBtn");
    const assistantBtn = container.querySelector("#plotStarterTriggerAssistantBtn");
    const chips = container.querySelectorAll(".plot-chip-btn");

    if (writeBtn && dom.messageInput) {
      writeBtn.onclick = () => {
        dom.messageInput.placeholder = "🎭 Опишите действие или реплику вашего персонажа в сцене...";
        dom.messageInput.focus();
      };
    }

    if (assistantBtn) {
      assistantBtn.onclick = () => {
        if (typeof window.triggerAutoFirstMessageGlobal === "function") {
          window.triggerAutoFirstMessageGlobal(state.activeGmSceneId);
        }
      };
    }

    chips.forEach(chip => {
      chip.onclick = () => {
        if (dom.messageInput) {
          dom.messageInput.value = chip.dataset.prompt;
          autoResizeComposer();
          dom.messageInput.focus();
        }
      };
    });
    return;
  }

  const charName = character?.name || "Персонаж";
  const scenarioText = character?.scenario ? `«${character.scenario.slice(0, 180)}${character.scenario.length > 180 ? "..." : ""}»` : "";

  // Hero portrait: the real avatar when the card has one, otherwise a
  // deterministic gradient + initials, matching the chat header fallback.
  const avatarSrc = character?.avatar || character?.image || "";
  const avatarStyle = getAvatarStyleForName(charName);
  const heroAvatar = avatarSrc
    ? `<img class="plot-starter-avatar-img" src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(charName)}" />`
    : `<span class="plot-starter-avatar-initials" style="background:${avatarStyle.gradient}">${escapeHtml(avatarStyle.initials)}</span>`;

  const charDescription = character?.description || character?.personality || "";
  const traits = Array.isArray(character?.traits) ? character.traits.filter(Boolean).slice(0, 6) : [];
  const traitsHtml = traits.length
    ? `<div class="plot-starter-traits">${traits.map(t => `<span class="plot-starter-trait">${escapeHtml(t)}</span>`).join("")}</div>`
    : "";

  container.innerHTML = `
    <div class="plot-starter-card">
      <div class="plot-starter-hero">
        <div class="plot-starter-avatar">${heroAvatar}</div>
        <h3 class="plot-starter-hero-name">${escapeHtml(charName)}</h3>
        ${charDescription ? `<p class="plot-starter-hero-desc">${escapeHtml(charDescription)}</p>` : ""}
        ${traitsHtml}
        <p class="plot-starter-subtitle">Задайте сюжет своим первым сообщением или используйте готовые варианты</p>
      </div>

      ${scenarioText ? `<div class="plot-starter-scenario-box"><strong>Сценарий:</strong> ${escapeHtml(scenarioText)}</div>` : ""}

      <div class="plot-starter-actions">
        <button type="button" class="plot-action-btn primary" id="plotStarterWriteUserBtn">
          <span class="btn-emoji">✍️</span>
          <div class="btn-text-group">
            <strong>Написать свое сообщение (Задать сюжет)</strong>
            <span>Вы делаете первый ход в истории</span>
          </div>
        </button>

        <button type="button" class="plot-action-btn secondary" id="plotStarterTriggerAssistantBtn">
          <span class="btn-emoji">🤖</span>
          <div class="btn-text-group">
            <strong>Приветствие персонажа</strong>
            <span>Пусть ${escapeHtml(charName)} начнет диалог первым</span>
          </div>
        </button>

        <button type="button" class="plot-action-btn secondary" id="plotStarterAiIdeaBtn">
          <span class="btn-emoji">🎲</span>
          <div class="btn-text-group">
            <strong>Сгенерировать идею завязки (ИИ)</strong>
            <span>Создать стартовый вариант от ИИ</span>
          </div>
        </button>
      </div>

      <div class="plot-suggestions-section">
        <span class="suggestions-heading">💡 Нажмите, чтобы подставить заготовку первое сообщения:</span>
        <div class="plot-chips-grid">
          <button type="button" class="plot-chip-btn" data-prompt="Я тихо вхожу в помещение, осмотревшись по сторонам, и обращаюсь к тебе:">«Я тихо вхожу в помещение...»</button>
          <button type="button" class="plot-chip-btn" data-prompt="Подлив напитка в бокал, я присаживаюсь напротив тебя и заговорщически шепчу:">«Подлив напитка в бокал...»</button>
          <button type="button" class="plot-chip-btn" data-prompt="Мы очнулись в полуразрушенном здании после сильного взрыва...">«Мы очнулись после взрыва...»</button>
        </div>
      </div>
    </div>
  `;

  dom.messages.appendChild(container);

  const writeBtn = container.querySelector("#plotStarterWriteUserBtn");
  const assistantBtn = container.querySelector("#plotStarterTriggerAssistantBtn");
  const aiIdeaBtn = container.querySelector("#plotStarterAiIdeaBtn");
  const chips = container.querySelectorAll(".plot-chip-btn");

  // A broken avatar URL must not leave a torn image placeholder in the hero
  const heroImg = container.querySelector(".plot-starter-avatar-img");
  if (heroImg) {
    heroImg.addEventListener("error", () => {
      heroImg.remove();
      const slot = container.querySelector(".plot-starter-avatar");
      if (slot && !slot.querySelector(".plot-starter-avatar-initials")) {
        const fallback = document.createElement("span");
        fallback.className = "plot-starter-avatar-initials";
        fallback.style.background = avatarStyle.gradient;
        fallback.textContent = avatarStyle.initials;
        slot.appendChild(fallback);
      }
    });
  }

  if (writeBtn && dom.messageInput) {
    writeBtn.onclick = () => {
      dom.messageInput.placeholder = "Напишите первое сообщение, чтобы начать сюжет...";
      dom.messageInput.focus();
    };
  }

  if (assistantBtn) {
    assistantBtn.onclick = () => {
      if (typeof window.triggerAutoFirstMessageGlobal === "function") {
        window.triggerAutoFirstMessageGlobal(character?.id);
      }
    };
  }

  if (aiIdeaBtn) {
    aiIdeaBtn.onclick = () => {
      if (typeof window.generatePlotStarterIdeaGlobal === "function") {
        window.generatePlotStarterIdeaGlobal(character?.id);
      }
    };
  }

  chips.forEach(chip => {
    chip.onclick = () => {
      if (dom.messageInput) {
        dom.messageInput.value = chip.dataset.prompt;
        autoResizeComposer();
        dom.messageInput.focus();
      }
    };
  });
}

export function renderMessages() {
  const isGm = state.sidebarTab === "gm";
  const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
  const character = isGm ? null : state.characters.find(c => c.id === activeId);
  
  if (!activeId) {
    dom.activeCharacterName.textContent = isGm ? "No Scene Selected" : "No character selected";
    if (dom.headerCharAvatarWrap) dom.headerCharAvatarWrap.style.display = "none";
    if (dom.editCharacterBtn) dom.editCharacterBtn.style.display = "none";
    if (dom.chatHeaderEnhanceBtn) dom.chatHeaderEnhanceBtn.style.display = "none";
    if (dom.duoChatBtn) dom.duoChatBtn.style.display = "none";
    if (dom.gmSceneHeaderBanner) dom.gmSceneHeaderBanner.style.display = "none";
    if (dom.chatSelectorContainer) dom.chatSelectorContainer.style.display = "none";
    dom.messages.innerHTML = `
      <div class="welcome-hero-card">
        <div class="welcome-hero-logo"><img src="./app_logo.png" alt="" /></div>
        <div class="welcome-hero-badge">✨ Heaven Chat Studio</div>
        <h2>Добро пожаловать в мир живых историй</h2>
        <p>Выберите персонажа из списка слева, чтобы продолжить сюжет, или откройте Character Studio для создания нового героя.</p>
        <div class="welcome-feature-grid">
          <div class="welcome-feature">
            <span class="welcome-feature-icon">🎭</span>
            <span class="welcome-feature-title">Живые персонажи</span>
            <span class="welcome-feature-text">Характер, сценарий и память диалога</span>
          </div>
          <div class="welcome-feature">
            <span class="welcome-feature-icon">🎬</span>
            <span class="welcome-feature-title">GM-сцены</span>
            <span class="welcome-feature-text">Несколько участников в одной истории</span>
          </div>
          <div class="welcome-feature">
            <span class="welcome-feature-icon">🧭</span>
            <span class="welcome-feature-title">Каталог</span>
            <span class="welcome-feature-text">Готовые герои для быстрого старта</span>
          </div>
        </div>
        <div class="welcome-hero-actions">
          <button type="button" class="welcome-action-btn primary" id="welcomeOpenStudioBtn">
            <span>✨ Создать персонажа</span>
          </button>
        </div>
      </div>
    `;
    dom.messages.dataset.empty = "true";
    const openStudioBtn = dom.messages.querySelector("#welcomeOpenStudioBtn");
    if (openStudioBtn && dom.adminDialog) {
      openStudioBtn.addEventListener("click", () => dom.adminDialog.showModal());
    }
    return;
  }

  if (isGm) {
    const scene = state.gmScenes.find(s => s.id === activeId);
    dom.activeCharacterName.innerHTML = `<span class="gm-title-badge">GM СЦЕНА</span> <span>${escapeHtml(scene ? scene.name : "Scene")}</span>`;
    if (dom.headerCharAvatarWrap) {
      dom.headerCharAvatarWrap.style.display = "flex";
      if (dom.headerCharAvatarImg) dom.headerCharAvatarImg.style.display = "none";
      if (dom.headerCharAvatarFallback) {
        dom.headerCharAvatarFallback.textContent = "🎭";
        dom.headerCharAvatarFallback.style.display = "flex";
        dom.headerCharAvatarFallback.style.background = "linear-gradient(135deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.05))";
        dom.headerCharAvatarFallback.style.borderColor = "rgba(255, 255, 255, 0.25)";
        dom.headerCharAvatarFallback.style.boxShadow = "0 0 14px rgba(255, 255, 255, 0.15)";
      }
    }
    if (dom.adoptActiveCharAsPersonaBtn) dom.adoptActiveCharAsPersonaBtn.style.display = "none";
    if (dom.editCharacterBtn) {
      dom.editCharacterBtn.style.display = "inline-block";
      dom.editCharacterBtn.title = "Редактировать сцену и участников (Edit Scene)";
    }
    if (dom.chatHeaderEnhanceBtn) dom.chatHeaderEnhanceBtn.style.display = "none";
    if (dom.duoChatBtn) dom.duoChatBtn.style.display = "none";
 
    // Update GM scene atmospheric banner
    if (dom.gmSceneHeaderBanner) {
      dom.gmSceneHeaderBanner.style.display = "block";
      if (dom.gmBannerScenarioText) {
        dom.gmBannerScenarioText.textContent = scene?.scenario ? scene.scenario : "Обстановка и завязка сюжета не описаны";
      }
      if (dom.gmBannerParticipantsList) {
        dom.gmBannerParticipantsList.innerHTML = "";
        const participants = scene?.participants || [];
        if (participants.length > 0) {
          participants.forEach(p => {
            const style = getAvatarStyleForName(p.name);
            const chip = document.createElement("div");
            chip.className = "gm-participant-chip";
            chip.title = `${p.name}: ${p.speech || p.personality || "Участник сцены"}`;
            const avatarContent = style.imageHtml ? style.imageHtml : style.initials;
            chip.innerHTML = `
              <span class="chip-avatar" style="background: ${style.gradient}">${avatarContent}</span>
              <span class="chip-name">${escapeHtml(p.name)}</span>
            `;
            dom.gmBannerParticipantsList.appendChild(chip);
          });
        } else {
          const noNpcSpan = document.createElement("span");
          noNpcSpan.className = "gm-no-npcs";
          noNpcSpan.textContent = "Нет NPC в сцене";
          dom.gmBannerParticipantsList.appendChild(noNpcSpan);
        }

        const editSceneBtn = document.createElement("button");
        editSceneBtn.type = "button";
        editSceneBtn.className = "gm-banner-edit-btn";
        editSceneBtn.innerHTML = `⚙️ Настройки`;
        editSceneBtn.addEventListener("click", () => {
          if (editGmSceneCallback) editGmSceneCallback(activeId);
        });
        dom.gmBannerParticipantsList.appendChild(editSceneBtn);
      }
    }

    if (dom.messageInput) {
      dom.messageInput.placeholder = "🎭 Опишите действие или реплику вашего персонажа в сцене...";
    }
  } else {
    if (dom.gmSceneHeaderBanner) dom.gmSceneHeaderBanner.style.display = "none";
    if (dom.messageInput) {
      dom.messageInput.placeholder = "Напишите сообщение…";
    }
    if (!character) {
      dom.activeCharacterName.textContent = "No character selected";
      if (dom.headerCharAvatarWrap) dom.headerCharAvatarWrap.style.display = "none";
      if (dom.editCharacterBtn) dom.editCharacterBtn.style.display = "none";
      if (dom.chatHeaderEnhanceBtn) dom.chatHeaderEnhanceBtn.style.display = "none";
      if (dom.duoChatBtn) dom.duoChatBtn.style.display = "none";
      dom.messages.innerHTML = "";
      dom.messages.dataset.empty = "true";
      return;
    }
    dom.activeCharacterName.textContent = character.name;
    if (dom.headerCharAvatarWrap) {
      dom.headerCharAvatarWrap.style.display = "flex";
      const avatarSrc = character.avatar || character.image || "";
      if (avatarSrc && dom.headerCharAvatarImg) {
        dom.headerCharAvatarImg.src = avatarSrc;
        dom.headerCharAvatarImg.style.display = "block";
        if (dom.headerCharAvatarFallback) dom.headerCharAvatarFallback.style.display = "none";
      } else if (dom.headerCharAvatarFallback) {
        const initials = (character.name || "?").trim().slice(0, 2).toUpperCase();
        dom.headerCharAvatarFallback.textContent = initials;
        dom.headerCharAvatarFallback.style.display = "flex";
        dom.headerCharAvatarFallback.style.background = "";
        dom.headerCharAvatarFallback.style.borderColor = "";
        dom.headerCharAvatarFallback.style.boxShadow = "";
        if (dom.headerCharAvatarImg) dom.headerCharAvatarImg.style.display = "none";
      }
    }
    if (dom.adoptActiveCharAsPersonaBtn) dom.adoptActiveCharAsPersonaBtn.style.display = "inline-flex";
    if (dom.editCharacterBtn) {
      dom.editCharacterBtn.style.display = "inline-block";
      dom.editCharacterBtn.title = "Edit Character";
    }
    if (dom.chatHeaderEnhanceBtn) dom.chatHeaderEnhanceBtn.style.display = "inline-flex";
    if (dom.duoChatBtn) dom.duoChatBtn.style.display = "inline-block";
  }

  const activeChatId = getActiveChatId(activeId);
  renderDirectivesBar();
  updateHeaderStateBadge();

  // Render GM Scene NPCs in Right Sidebar if GM scene
  const gmNpcSection = document.getElementById("gmSceneNpcSection");
  const gmNpcList = document.getElementById("gmSidebarNpcList");
  if (gmNpcSection && gmNpcList) {
    if (isGm && activeId) {
      gmNpcSection.style.display = "block";
      gmNpcList.innerHTML = "";
      const scene = state.gmScenes.find(s => s.id === activeId);
      const participants = scene?.participants || [];
      if (participants.length === 0) {
        gmNpcList.innerHTML = `<span style="font-size: 11px; color: var(--text-muted); font-style: italic;">В этой сцене пока нет персонажей. Нажмите «Настроить», чтобы добавить героев!</span>`;
      } else {
        participants.forEach(p => {
          const style = getAvatarStyleForName(p.name);
          const avatarContent = style.imageHtml ? style.imageHtml : style.initials;
          const item = document.createElement("div");
          item.className = "gm-sidebar-npc-item";
          item.innerHTML = `
            <div class="char-avatar-wrap" style="width: 28px; height: 28px; flex-shrink: 0;">
              <div class="char-avatar-fallback" style="background: ${style.gradient}; font-size: 11px; width: 100%; height: 100%; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700;">${avatarContent}</div>
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 12px; font-weight: 600; color: #ffffff; display: flex; align-items: center; justify-content: space-between;">
                <span>${escapeHtml(p.name)}</span>
                <span class="gm-npc-badge" style="font-size: 9px; padding: 1px 5px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 4px; color: #f4f4f5;">NPC</span>
              </div>
              <div style="font-size: 11px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${escapeHtml(p.speech || p.personality || "Участник сцены")}
              </div>
            </div>
          `;
          gmNpcList.appendChild(item);
        });
      }
    } else {
      gmNpcSection.style.display = "none";
    }
  }
  const chat = state.chats[activeChatId] || [];
  const total = chat.length;

  const chatSwitched = lastRenderedChatId !== activeChatId;
  if (chatSwitched) messagesLoadedBeyondWindow = 0;

  const visibleStart = Math.max(0, total - MAX_VISIBLE_MESSAGES - messagesLoadedBeyondWindow);
  const visibleCount = total - visibleStart;

  const chatChanged = chatSwitched || (lastRenderedChatLength !== total);
  lastRenderedChatId = activeChatId;
  lastRenderedChatLength = total;

  const existingArticles = dom.messages.querySelectorAll("article.message");
  if (state.isStreaming && !chatChanged && existingArticles.length === visibleCount && visibleCount > 0) {
    const lastArticle = existingArticles[existingArticles.length - 1];
    const lastMessage = chat[total - 1];
    
    const isSameMessage = lastArticle.dataset.timestamp === String(lastMessage.timestamp);
    if (isSameMessage && lastArticle.classList.contains(lastMessage.role)) {
      if (lastMessage.characterId) {
        const hasSecondary = lastArticle.classList.contains("char-secondary");
        const shouldSecondary = lastMessage.characterId !== state.activeCharacterId;
        if (hasSecondary === shouldSecondary) {
          updateLastArticleContent(lastArticle, lastMessage);
          if (isScrolledToBottom()) {
            dom.messages.scrollTop = dom.messages.scrollHeight;
          }
          return;
        }
      } else {
        updateLastArticleContent(lastArticle, lastMessage);
        if (isScrolledToBottom()) {
          dom.messages.scrollTop = dom.messages.scrollHeight;
        }
        return;
      }
    }
  }

  // Snapshot the scroll position before the list is wiped, so it can be
  // restored afterwards instead of unconditionally jumping to the bottom.
  const previousScroll = captureMessagesScroll();

  dom.messages.innerHTML = "";
  dom.messages.dataset.empty = chat.length === 0 ? "true" : "false";

  if (chat.length === 0) {
    renderPlotStarterEmptyState(character);
    return;
  }

  if (visibleStart > 0) {
    const hiddenCount = visibleStart;
    const loadEarlierBtn = document.createElement("button");
    loadEarlierBtn.type = "button";
    loadEarlierBtn.className = "load-earlier-btn";
    loadEarlierBtn.innerHTML = `<span class="load-earlier-chevron">↑</span><span>Показать более ранние</span><span class="load-earlier-count">${hiddenCount}</span>`;
    loadEarlierBtn.addEventListener("click", () => {
      isLoadingEarlier = true;
      try {
        messagesLoadedBeyondWindow += MESSAGE_PAGE_SIZE;
        renderMessages();
      } finally {
        isLoadingEarlier = false;
      }
    });
    dom.messages.appendChild(loadEarlierBtn);
  }

  for (let i = visibleStart; i < total; i++) {
    const message = chat[i];

    if (message.isTimeSkip) {
      const banner = document.createElement("div");
      banner.className = "time-skip-banner";
      banner.dataset.index = i;
      
      const timeStr = message.timeText || "Перемотка времени";
      const detailStr = message.detailText || "";

      banner.innerHTML = `
        <div class="time-skip-divider-line"></div>
        <div class="time-skip-content">
          <div class="time-skip-title"><span>⏳</span> <span>${escapeHtml(timeStr)}</span></div>
          ${detailStr ? `<div class="time-skip-details">${escapeHtml(detailStr)}</div>` : ""}
          <button type="button" class="time-skip-delete-btn" title="Удалить временной переход">&times;</button>
        </div>
        <div class="time-skip-divider-line"></div>
      `;

      const delBtn = banner.querySelector(".time-skip-delete-btn");
      if (delBtn) {
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm("Удалить этот временной переход из истории?")) {
            if (deleteMessageCallback) deleteMessageCallback(i);
          }
        });
      }

      dom.messages.appendChild(banner);
      continue;
    }

    const article = document.createElement("article");
    article.dataset.timestamp = message.timestamp || "";
    article.dataset.index = i;
    let messageClass = `message ${message.role}`;
    if (message.isGmMessage && isGm) {
      messageClass = "message assistant gm-message-container";
    }
    
    // Duo mode: add character-specific class
    let speakerName = "";
    if (message.role === "assistant") {
      if (message.characterId) {
        const speaker = state.characters.find(c => c.id === message.characterId);
        if (speaker) {
          speakerName = speaker.name;
          if (message.characterId === state.activeCharacterId) {
            messageClass += " char-primary";
          } else {
            messageClass += " char-secondary";
          }
        } else {
          speakerName = character ? (character.name || "Assistant") : "Assistant";
          messageClass += " char-primary";
        }
      } else {
        speakerName = character ? (character.name || "Assistant") : "Assistant";
        messageClass += " char-primary";
      }
    }
    article.className = messageClass;
    if (state.isStreaming && i === total - 1) article.classList.add("is-streaming");
    const actualIndex = i;

    const role = document.createElement("div");
    role.className = "message-role";
    if (message.role === "user") {
      const who = avatarForSpeaker("", "user");
      const avatar = createMessageAvatar(who.name, who.src);
      role.appendChild(avatar);
      const label = document.createElement("span");
      label.className = "message-role-name";
      label.textContent = (state.apiSettings.userName || "User").toUpperCase();
      role.appendChild(label);
    } else if (message.role === "assistant") {
      if (isGm) {
        role.innerHTML = `<span class="role-gm-dot"></span><span class="message-role-name">🎭 ГЕЙМ-МАСТЕР</span>`;
        role.style.color = "var(--text-primary, #ffffff)";
      } else {
        const who = avatarForSpeaker(speakerName, "assistant");
        role.appendChild(createMessageAvatar(who.name, who.src));
        const label = document.createElement("span");
        label.className = "message-role-name";
        label.textContent = (speakerName || "Assistant").toUpperCase();
        role.appendChild(label);
        role.style.color = "";
      }
    } else {
      role.textContent = message.role.toUpperCase();
    }
    const body = document.createElement("div");
    body.className = "message-body";
    
    const displayMode = state.apiSettings?.thinkingDisplay || (state.apiSettings?.enableInnerMonologue === false ? "hidden" : "collapsed");
    const isRu = (state.apiSettings?.chatLanguage || "ru") === "ru";

    const parsed = parseThoughtAndContent(message.content);
    if (parsed.thought && displayMode !== "hidden") {
      const thoughtEl = document.createElement("div");
      thoughtEl.className = "message-thought collapsed";
      
      const header = document.createElement("div");
      header.className = "thought-header";
      header.innerHTML = `💭 <span class="thought-title">${isRu ? "Размышления" : "Inner Monologue"}</span> <span class="thought-toggle-icon">▼</span>`;
      header.addEventListener("click", (e) => {
        e.stopPropagation();
        thoughtEl.classList.toggle("collapsed");
      });
      
      const thoughtText = document.createElement("div");
      thoughtText.className = "thought-text";
      thoughtText.innerHTML = formatMessageContent(parsed.thought);
      
      thoughtEl.appendChild(header);
      thoughtEl.appendChild(thoughtText);
      body.appendChild(thoughtEl);
    }
    
    const dialogueEl = document.createElement("div");
    dialogueEl.className = "message-dialogue dialogue-text";
    const isLastAndStreaming = (i === total - 1) && state.isStreaming;
    if (message.isGmMessage && isGm) {
      const gmBlocks = parseGmMessage(parsed.content);
      if (gmBlocks.length === 0) {
        if (state.retryStatus && isLastAndStreaming && state.retryStatus.remainingSeconds > 0) {
          const totalSec = Math.max(1, Math.ceil((state.retryStatus.delayMs || 5000) / 1000));
          const currentSec = state.retryStatus.remainingSeconds;
          const percent = Math.min(100, Math.max(0, Math.round(((totalSec - currentSec) / totalSec) * 100)));
          dialogueEl.innerHTML = `
            <div class="gm-narrator-card gm-loading-card">
              <div class="gm-narrator-header">
                <span class="gm-narrator-icon">⏳</span>
                <span class="gm-narrator-title">ОЖИДАНИЕ СЛОТА ПРОВАЙДЕРА (429)...</span>
              </div>
              <div class="gm-narrator-text">
                <div class="retry-indicator-card" style="margin: 6px 0; border: none; background: transparent; padding: 0; box-shadow: none;">
                  <div class="retry-countdown-bar">
                    <div class="retry-countdown-fill" style="width: ${percent}%"></div>
                  </div>
                  <div class="retry-desc" style="margin-top: 6px;">
                    Провайдер перегружен. Повтор попытки <strong>${state.retryStatus.attempt}/${state.retryStatus.maxRetries}</strong> через <strong>${currentSec} сек</strong>...
                  </div>
                </div>
              </div>
            </div>
          `;
        } else {
          dialogueEl.innerHTML = `
            <div class="gm-narrator-card gm-loading-card">
              <div class="gm-narrator-header">
                <span class="gm-narrator-icon">🎭</span>
                <span class="gm-narrator-title">ГЕЙМ-МАСТЕР ОПИСЫВАЕТ СОБЫТИЯ...</span>
              </div>
              <div class="gm-narrator-text">
                <div class="typing-indicator">
                  <span class="dot"></span>
                  <span class="dot"></span>
                  <span class="dot"></span>
                </div>
              </div>
            </div>
          `;
        }
      } else {
        gmBlocks.forEach((block) => {
          dialogueEl.appendChild(createGmBlockElement(block));
        });
      }
    } else {
      if (!parsed.content && isLastAndStreaming) {
        if (state.retryStatus && state.retryStatus.remainingSeconds > 0) {
          const totalSec = Math.max(1, Math.ceil((state.retryStatus.delayMs || 5000) / 1000));
          const currentSec = state.retryStatus.remainingSeconds;
          const percent = Math.min(100, Math.max(0, Math.round(((totalSec - currentSec) / totalSec) * 100)));
          dialogueEl.innerHTML = `
            <div class="retry-indicator-card">
              <div class="retry-indicator-header">
                <span class="retry-spinner">⏳</span>
                <span class="retry-title">Лимит запросов провайдера (429)</span>
                <span class="retry-badge">Попытка ${state.retryStatus.attempt}/${state.retryStatus.maxRetries}</span>
              </div>
              <div class="retry-countdown-bar">
                <div class="retry-countdown-fill" style="width: ${percent}%"></div>
              </div>
              <div class="retry-desc">
                Провайдер временно перегружен. Авто-повтор через <strong>${currentSec} сек</strong>...
              </div>
            </div>
          `;
        } else {
          dialogueEl.innerHTML = `
            <div class="typing-indicator">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          `;
        }
      } else if (!parsed.content && !isLastAndStreaming) {
        if (message.role === "user") {
          dialogueEl.innerHTML = `<em style="color: var(--text-muted); font-size: 0.9em; opacity: 0.7; font-style: italic;">(молчание)</em>`;
        } else {
          dialogueEl.innerHTML = `<em style="color: var(--text-muted); font-size: 0.9em; opacity: 0.7;">(No response generated - the model might have run out of tokens or only generated thinking)</em>`;
        }
      } else {
        dialogueEl.innerHTML = formatMessageContent(parsed.content);
      }
    }

    dialogueEl.addEventListener("dblclick", (e) => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) return;
      e.stopPropagation();
      startInlineEdit(article, actualIndex, message, dialogueEl, parsed);
    });

    body.appendChild(dialogueEl);

    if (message.evaluatorData) {
      const evaluatorEl = createEvaluatorSpoilerElement(message.evaluatorData, actualIndex);
      if (evaluatorEl) {
        body.appendChild(evaluatorEl);
      }
    }

    if (message.images && Array.isArray(message.images) && message.images.length > 0) {
      const imagesGrid = document.createElement("div");
      imagesGrid.className = "message-images-grid";
      message.images.forEach((imgUrl) => {
        const imgThumb = document.createElement("img");
        imgThumb.src = imgUrl;
        imgThumb.alt = "Attached image";
        imgThumb.className = "message-image-thumb";
        imgThumb.addEventListener("click", (e) => {
          e.stopPropagation();
          openImageViewer(imgUrl);
        });
        imagesGrid.appendChild(imgThumb);
      });
      body.appendChild(imagesGrid);
    }

    if (message.timestamp) {
      const d = new Date(message.timestamp);
      const hours = String(d.getHours()).padStart(2, "0");
      const mins = String(d.getMinutes()).padStart(2, "0");
      const timeSpan = document.createElement("span");
      timeSpan.className = "message-timestamp";
      timeSpan.textContent = `${hours}:${mins}`;
      body.appendChild(timeSpan);
    }

    if (message.edited) {
      const editedSpan = document.createElement("span");
      editedSpan.className = "edited-indicator";
      editedSpan.textContent = " (edited)";
      role.appendChild(editedSpan);
    }

    article.appendChild(role);
    article.appendChild(body);

    const actionsBar = document.createElement("div");
    actionsBar.className = "message-actions-inline";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "action-btn";
    copyBtn.title = "Copy content";
    copyBtn.dataset.label = "Копировать";
    copyBtn.dataset.icon = "📋";
    copyBtn.innerHTML = '<svg class="feather" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(message.content).then(() => {
        setStatus("Copied to clipboard!");
      }).catch(() => {
        setStatus("Copy failed.");
      });
    });
    actionsBar.appendChild(copyBtn);

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "action-btn";
    editBtn.title = "Edit message";
    editBtn.dataset.label = "Редактировать";
    editBtn.dataset.icon = "✏️";
    editBtn.innerHTML = '<svg class="feather" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>';
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startInlineEdit(article, actualIndex, message, dialogueEl, parsed);
    });
    actionsBar.appendChild(editBtn);

    if (message.role === "assistant") {
      if (i === total - 1 || (message.swipes && message.swipes.length > 1)) {
        article.classList.add("has-swipes");
        const swipes = message.swipes && Array.isArray(message.swipes) && message.swipes.length > 0
          ? message.swipes
          : [message.content];
        const currentIndex = message.swipeIndex !== undefined ? message.swipeIndex : (swipes.length - 1);

        const swipeBar = document.createElement("div");
        swipeBar.className = "message-swipe-bar";

        const prevBtn = document.createElement("button");
        prevBtn.type = "button";
        prevBtn.className = "swipe-prev";
        prevBtn.title = "Предыдущий вариант (Alt+Left)";
        prevBtn.textContent = "‹";
        prevBtn.disabled = currentIndex <= 0;
        prevBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (swipeCallback) swipeCallback(actualIndex, currentIndex - 1);
        });
        swipeBar.appendChild(prevBtn);

        const counter = document.createElement("span");
        counter.className = "swipe-counter";
        counter.textContent = `${currentIndex + 1}/${swipes.length}`;
        swipeBar.appendChild(counter);

        const nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.className = "swipe-next";
        nextBtn.title = currentIndex < swipes.length - 1 ? "Следующий вариант (Alt+Right)" : "Сгенерировать новый вариант";
        nextBtn.textContent = "›";
        nextBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (currentIndex < swipes.length - 1) {
            if (swipeCallback) swipeCallback(actualIndex, currentIndex + 1);
          } else {
            if (regenerateCallback) regenerateCallback(actualIndex);
          }
        });
        swipeBar.appendChild(nextBtn);

        actionsBar.appendChild(swipeBar);
      }

      const regenBtn = document.createElement("button");
      regenBtn.type = "button";
      regenBtn.className = "action-btn";
      regenBtn.title = "Regenerate response";
      regenBtn.dataset.label = "Сгенерировать заново";
      regenBtn.dataset.icon = "🔄";
      regenBtn.innerHTML = '<svg class="feather" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>';
      regenBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (regenerateCallback) regenerateCallback(actualIndex);
      });
      actionsBar.appendChild(regenBtn);

      if (i === total - 1) {
        const continueBtn = document.createElement("button");
        continueBtn.type = "button";
        continueBtn.className = "action-btn continue-btn";
        continueBtn.title = "Продолжить генерацию ответа (Continue)";
        continueBtn.dataset.label = "Продолжить";
        continueBtn.dataset.icon = "▶";
        continueBtn.innerHTML = '<svg class="feather" viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>';
        continueBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (continueCallback) continueCallback(actualIndex);
        });
        actionsBar.appendChild(continueBtn);
      }
    }

    const translateBtn = document.createElement("button");
    translateBtn.type = "button";
    translateBtn.className = `action-btn${message.translationRu ? " active" : ""}`;
    translateBtn.title = message.translationRu ? "Показать/скрыть перевод" : "Перевести на русский";
    translateBtn.dataset.label = message.translationRu ? "Скрыть перевод" : "Перевести на русский";
    translateBtn.dataset.icon = "🌐";
    translateBtn.innerHTML = '<svg class="feather" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10z"></path></svg>';
    
    if (message.translationRu) {
      setTimeout(() => {
        renderTranslationBox(article, message.translationRu);
      }, 0);
    }

    translateBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      let translationBox = article.querySelector(".message-translation-box");
      if (translationBox) {
        translationBox.style.display = translationBox.style.display === "none" ? "block" : "none";
        return;
      }

      if (message.translationRu) {
        renderTranslationBox(article, message.translationRu);
        return;
      }

      translateBtn.disabled = true;
      translateBtn.classList.add("loading-spin");
      setStatus("Перевожу сообщение на русский...");
      try {
        const translatedText = await translateMessageText(message.content);
        message.translationRu = translatedText;
        saveChats(state.chats);
        if (state.activeGmSceneId && state.gmChats[state.activeGmSceneId]) {
          saveGmChats(state.gmChats);
        }
        renderTranslationBox(article, translatedText);
        translateBtn.classList.add("active");
        setStatus("Перевод завершен!");
      } catch (err) {
        console.error("Translation error:", err);
        setStatus("Ошибка перевода: " + (err.message || err));
      } finally {
        translateBtn.disabled = false;
        translateBtn.classList.remove("loading-spin");
      }
    });
    actionsBar.appendChild(translateBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "action-btn";
    deleteBtn.title = "Delete message";
    deleteBtn.dataset.label = "Удалить";
    deleteBtn.dataset.icon = "🗑️";
    deleteBtn.dataset.danger = "true";
    deleteBtn.innerHTML = '<svg class="feather" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (deleteMessageCallback) deleteMessageCallback(actualIndex);
    });
    actionsBar.appendChild(deleteBtn);

    // Mobile-only trigger: collapses the 7 icon buttons into one bottom sheet
    const moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "message-actions-more";
    moreBtn.title = "Действия с сообщением";
    moreBtn.setAttribute("aria-label", "Действия с сообщением");
    moreBtn.innerHTML = '<svg class="feather" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>';
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openMobileActionSheet(actionsBar);
    });
    actionsBar.appendChild(moreBtn);

    article.appendChild(actionsBar);

    article.addEventListener("click", (e) => {
      if (e.target.closest(".action-btn") || article.classList.contains("editing")) return;
      document.querySelectorAll(".message.actions-visible").forEach(a => {
        if (a !== article) a.classList.remove("actions-visible");
      });
      article.classList.toggle("actions-visible");
    });

    article.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showContextMenu(actualIndex, e.clientX, e.clientY);
    });
    
    dom.messages.appendChild(article);
  }

  if (chatSwitched) {
    // A different conversation: always open at the newest message, never at
    // the offset the previous chat happened to be scrolled to.
    dom.messages.scrollTop = dom.messages.scrollHeight;
  } else {
    restoreMessagesScroll(previousScroll);
  }
}

export function renderDebugLogs() {
  if (!dom.debugLogList || !dom.debugLogDetail) return;
  
  // 1. Update Jev Banner Stats
  const jevLogs = state.jevLogs || [];
  const jevCount = jevLogs.length;
  if (dom.jevCount) dom.jevCount.textContent = jevCount;
  
  if (dom.jevAvgLatency) {
    if (jevCount > 0) {
      const totalLatency = jevLogs.reduce((acc, l) => acc + (l.latencyMs || 0), 0);
      const avg = Math.round(totalLatency / jevCount);
      dom.jevAvgLatency.textContent = `${avg}ms`;
    } else {
      dom.jevAvgLatency.textContent = "0ms";
    }
  }

  if (dom.jevStatusPill) {
    if (jevCount > 0) {
      const lastLog = jevLogs[0];
      if (lastLog.ok === false) {
        dom.jevStatusPill.textContent = "Error";
        dom.jevStatusPill.className = "jev-status-pill error";
      } else {
        dom.jevStatusPill.textContent = "Active";
        dom.jevStatusPill.className = "jev-status-pill";
      }
    } else {
      dom.jevStatusPill.textContent = "Ready";
      dom.jevStatusPill.className = "jev-status-pill";
    }
  }

  // 2. Update filter buttons active class
  const activeFilter = state.activeDebugFilter || "all";
  const filterBtns = dom.debugFilterBtns && dom.debugFilterBtns.length > 0 
    ? dom.debugFilterBtns 
    : document.querySelectorAll(".debug-filter-btn");
  filterBtns.forEach(btn => {
    if (btn.dataset.filter === activeFilter) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  dom.debugLogList.innerHTML = "";

  // 3. Live System Prompt Context Item
  let liveLi = null;
  if (activeFilter === "all" || activeFilter === "prompt") {
    liveLi = document.createElement("li");
    liveLi.className = "debug-log-live-item";
    liveLi.innerHTML = `
      <div style="font-weight: bold; font-size: 13px; color: var(--text-primary);">
        🔍 Live System Prompt Context
      </div>
      <div style="font-size: 11px; color: #888; margin-top: 4px;">
        Preview prompt sent to OpenRouter
      </div>
    `;
    liveLi.addEventListener("click", () => {
      document.querySelectorAll("#debugLogList li").forEach(n => n.classList.remove("selected"));
      liveLi.classList.add("selected");
      
      const character = getActiveCharacter();
      if (!character) {
        dom.debugLogDetail.textContent = "Персонаж не выбран. Выберите персонажа в левой панели для просмотра его системного промпта.";
        return;
      }
      
      const systemPromptText = buildSystemContextCallback ? buildSystemContextCallback(character) : "";
      const hasGlobalPrompt = Boolean(state.globalSystemPrompt && state.globalSystemPrompt.trim());
      const hasCharPrompt = Boolean(character.systemPrompt && character.systemPrompt.trim());
      const isStabsActive = state.apiSettings?.stabsEdhEnabled !== false;

      const details = [
        `============================================================`,
        `🔍 ТЕКУЩИЙ СИСТЕМНЫЙ ПРОМПТ И КОНТЕКСТ ПЕРСОНАЖА:`,
        `============================================================`,
        `Активный персонаж:        ${character.name} (id: ${character.id})`,
        `Время предпросмотра:      ${new Date().toLocaleString()}`,
        `Глобальный промпт (Settings): ${hasGlobalPrompt ? `✅ Задан (${state.globalSystemPrompt.trim().length} симв.)` : "⚠️ Не задан (пусто в настройках)"}`,
        `Промпт персонажа (Card):      ${hasCharPrompt ? `✅ Задан (${character.systemPrompt.trim().length} симв.)` : "⚠️ Не задан в карточке"}`,
        `Директивы STAB'S EDH:         ${isStabsActive ? "✅ Включены (Anti-Slop, Anti-Echo, Суверенитет игрока)" : "❌ Отключены"}`,
        `Уровень инициативы:           ${state.apiSettings?.initiativeLevel || "balanced"}`,
        ``,
        `============================================================`,
        `📜 ПОЛНЫЙ ТЕКСТ СИСТЕМНОГО СООБЩЕНИЯ (ОТПРАВЛЯЕТСЯ В РОЛИ "SYSTEM"):`,
        `============================================================`,
        systemPromptText,
        ``,
        `============================================================`,
        `💡 Примечание: Этот текст отправляется первым элементом массива сообщений с ролью { role: "system" } в каждый запрос к нейросети.`
      ].join("\n");
      
      dom.debugLogDetail.textContent = details;
    });
    dom.debugLogList.appendChild(liveLi);
  }

  // 4. Combine and filter logs
  const combinedLogs = [];

  if (activeFilter === "all" || activeFilter === "dialogue") {
    (state.apiLogs || []).forEach(log => {
      combinedLogs.push({ ...log, entryType: "openrouter" });
    });
  }

  if (activeFilter === "all" || activeFilter === "jev") {
    jevLogs.forEach(log => {
      combinedLogs.push({ ...log, entryType: "jev" });
    });
  }

  combinedLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  if (combinedLogs.length === 0) {
    if (liveLi) {
      liveLi.click();
    } else {
      dom.debugLogDetail.textContent = `Логи по фильтру "${activeFilter}" пока отсутствуют.`;
    }
    return;
  }

  let firstLogLi = null;

  combinedLogs.forEach((log) => {
    const li = document.createElement("li");
    const time = new Date(log.timestamp).toLocaleTimeString();

    if (log.entryType === "jev") {
      li.className = "debug-log-normal-item debug-log-jev-item";
      li.innerHTML = `
        <div style="font-weight: bold; font-size: 13px; color: var(--text-primary); display: flex; align-items: center; justify-content: space-between;">
          <span>${log.action || "🧠 Jev System One"}</span>
          <span class="jev-pill-latency">${log.latencyMs || 0}ms</span>
        </div>
        <div style="font-size: 11.5px; color: var(--text-secondary); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <code>${log.model || "~typesafe/jev-latest"}</code> &bull; <span style="color:${log.ok ? '#ffffff' : '#ef4444'}; font-weight:600;">${log.ok ? "✓ OK" : "✗ Ошибка"}</span>
        </div>
        <div style="font-size: 10.5px; color: #888; margin-top: 2px;">
          ${time}
        </div>
      `;

      li.addEventListener("click", () => {
        document.querySelectorAll("#debugLogList li").forEach(n => n.classList.remove("selected"));
        li.classList.add("selected");

        const formattedAnswers = [];
        if (log.answers && Object.keys(log.answers).length > 0) {
          formattedAnswers.push(`=== 📊 КАЛИБРОВАННЫЕ ОТВЕТЫ И ВЕРОЯТНОСТИ (NOUL / CHOICE) ===`);
          for (const [qid, ans] of Object.entries(log.answers)) {
            let desc = "";
            if (!ans) {
              desc = "N/A";
            } else if (ans.type === "noul" || typeof ans.noul === "number") {
              const val = typeof ans.noul === "number" ? ans.noul : ans.value;
              desc = `[Noul] Вероятность: ${(val * 100).toFixed(1)}% (raw: ${val})`;
            } else if (ans.type === "choice" || typeof ans.choice === "string") {
              const conf = typeof ans.confidence === "number" ? ` (уверенность: ${(ans.confidence * 100).toFixed(1)}%)` : "";
              desc = `[Choice] Выбор: "${ans.choice}"${conf}`;
            } else if (ans.type === "score" || typeof ans.score === "number") {
              const conf = typeof ans.confidence === "number" ? ` (уверенность: ${(ans.confidence * 100).toFixed(1)}%)` : "";
              desc = `[Score] Оценка: ${ans.score}${conf}`;
            } else if (typeof ans.value === "number") {
              desc = `${(ans.value * 100).toFixed(1)}% (raw: ${ans.value})`;
            } else {
              desc = JSON.stringify(ans);
            }
            formattedAnswers.push(`• [${qid}]: ${desc}`);
          }
          formattedAnswers.push(``);
        }

        const details = [
          `=== 🧠 TYPESAFE JEV SYSTEM ONE DECISION ===`,
          `Действие:  ${log.action || "System One Decision"}`,
          `Время:     ${new Date(log.timestamp).toLocaleString()}`,
          `Модель:    ${log.model || "~typesafe/jev-latest"}`,
          `Задержка:  ${log.latencyMs || 0}ms`,
          `Статус:    ${log.ok ? "✓ УСПЕШНО (200 OK)" : "✗ ОШИБКА: " + (log.error || "Неизвестная ошибка")}`,
          `ID ответа: ${log.id || "N/A"}`,
          `Usage:     ${log.usage ? JSON.stringify(log.usage) : "N/A"}`,
          ``,
          ...formattedAnswers,
          `=== 📋 ВОПРОСЫ И КРИТЕРИИ (QUESTIONS) ===`,
          JSON.stringify(log.questions || {}, null, 2),
          ``,
          `=== 📦 ОЦЕНИВАЕМЫЙ КОНТЕКСТ (STATE) ===`,
          typeof log.state === "string" ? log.state : JSON.stringify(log.state, null, 2),
          ``,
          `=== 🔍 ПОЛНЫЙ СЫРОЙ ОТВЕТ СЕРВЕРА (ANSWERS JSON) ===`,
          JSON.stringify(log.answers || {}, null, 2)
        ].join("\n");

        dom.debugLogDetail.textContent = details;
      });

    } else {
      li.className = "debug-log-normal-item";
      const isStream = log.type === "stream";
      li.innerHTML = `
        <div style="font-weight: bold; font-size: 13px; color: var(--accent);">
          ${isStream ? "💬 Dialogue" : "⚙️ Background"} <span style="color:#aaa; font-weight:normal; font-size:11px;">${time}</span>
        </div>
        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${log.model}
        </div>
        <div style="font-size: 11px; color: #888; margin-top: 2px;">
          ⏱️ ${log.latencyMs}ms
        </div>
      `;

      li.addEventListener("click", () => {
        document.querySelectorAll("#debugLogList li").forEach(n => n.classList.remove("selected"));
        li.classList.add("selected");
        
        const formattedMessages = Array.isArray(log.messages) ? log.messages.map((m, idx) => {
          const roleUpper = (m.role || "unknown").toUpperCase();
          let headerNote = "";
          if (idx === 0 && m.role === "system") {
            headerNote = " 🧠 [НАЧАЛЬНЫЙ СИСТЕМНЫЙ ПРОМПТ И КОНТЕКСТ МИРА]";
          } else if (idx === log.messages.length - 1 && m.role === "system") {
            headerNote = " 🛡️ [ФИНАЛЬНЫЕ ДИРЕКТИВЫ STAB'S EDH / СИСТЕМНЫЙ РЕМАЙНДЕР]";
          } else if (m.role === "user") {
            headerNote = " 👤 [ХОД ПОЛЬЗОВАТЕЛЯ]";
          } else if (m.role === "assistant") {
            headerNote = " 🤖 [ОТВЕТ ПЕРСОНАЖА]";
          }
          const contentStr = typeof m.content === "string" 
            ? m.content 
            : JSON.stringify(m.content, null, 2);
          return `------------------------------------------------------------\n[СООБЩЕНИЕ ${idx + 1}] РОЛЬ: ${roleUpper}${headerNote}\n------------------------------------------------------------\n${contentStr}`;
        }).join("\n\n") : JSON.stringify(log.messages, null, 2);

        const details = [
          `Время отправки: ${new Date(log.timestamp).toLocaleString()}`,
          `Модель ИИ:      ${log.model}`,
          `Тип запроса:    ${log.type}`,
          `Задержка:       ${log.latencyMs}ms`,
          ``,
          `============================================================`,
          `📨 СООБЩЕНИЯ, ОТПРАВЛЕННЫЕ В МОДЕЛЬ (${Array.isArray(log.messages) ? log.messages.length : 0} шт.):`,
          `============================================================`,
          formattedMessages,
          ``,
          `============================================================`,
          `📥 ПОЛУЧЕННЫЙ ОТВЕТ МОДЕЛИ:`,
          `============================================================`,
          log.responseText || "(Пустой ответ)",
          ``,
          `============================================================`,
          `📦 СЫРОЙ JSON ЗАПРОСА (RAW PAYLOAD):`,
          `============================================================`,
          JSON.stringify(log.messages, null, 2)
        ].join("\n");
        
        dom.debugLogDetail.textContent = details;
      });
    }

    if (!firstLogLi) firstLogLi = li;
    dom.debugLogList.appendChild(li);
  });

  if (firstLogLi && (
    dom.debugLogDetail.textContent === "Выберите запрос из списка для просмотра деталей." || 
    dom.debugLogDetail.textContent === "Select a request to view details." ||
    dom.debugLogDetail.textContent.trim() === ""
  )) {
    firstLogLi.click();
  }
}

export function renderWizardChat() {
  if (!dom.wizardChatHistory) return;
  dom.wizardChatHistory.innerHTML = "";
  state.wizardMessages.forEach(msg => {
    const div = document.createElement("div");
    div.className = `wizard-bubble ${msg.role === "assistant" ? "wizard-bubble-assistant" : "wizard-bubble-user"}`;
    if (msg.role === "assistant") {
      div.textContent = "🧙‍♂️ " + msg.content;
    } else {
      div.textContent = "👤 " + msg.content;
    }
    dom.wizardChatHistory.appendChild(div);
  });
  dom.wizardChatHistory.scrollTop = dom.wizardChatHistory.scrollHeight;
}

export function renderPromptWizardChat() {
  if (!dom.promptWizardHistory) return;
  dom.promptWizardHistory.innerHTML = "";
  state.promptWizardMessages.forEach(msg => {
    const div = document.createElement("div");
    div.className = `prompt-wizard-bubble ${msg.role === "assistant" ? "prompt-wizard-bubble-assistant" : "prompt-wizard-bubble-user"}`;
    
    if (msg.role === "assistant") {
      let content = msg.content;
      const match = content.match(/```system_prompt\s*([\s\S]*?)(?:```|$)/i);
      if (match) {
        const textBefore = content.substring(0, match.index);
        const promptCode = match[1].trim();
        const textAfter = content.substring(match.index + match[0].length);
        
        div.innerHTML = `🤖 ${formatMessageContent(textBefore)}
        <div class="prompt-wizard-code-block">
          ${escapeHtml(promptCode)}
        </div>
        ${formatMessageContent(textAfter)}`;
      } else {
        div.innerHTML = `🤖 ${formatMessageContent(content)}`;
      }
    } else {
      div.textContent = "👤 " + msg.content;
    }
    dom.promptWizardHistory.appendChild(div);
  });
  dom.promptWizardHistory.scrollTop = dom.promptWizardHistory.scrollHeight;
}

export function renderCoreStatesEditorList(character) {
  if (!dom.coreStatesList) return;
  dom.coreStatesList.innerHTML = "";
  if (character && Array.isArray(character.coreStates)) {
    character.coreStates.forEach(cs => {
      const card = createCoreStateEditorCard(cs);
      dom.coreStatesList.appendChild(card);
    });
  }
}

// --- Render LoreBook entries list in editor ---
export function renderLoreBookEditorList(character) {
  if (!dom.loreBookList) return;
  dom.loreBookList.innerHTML = "";
  if (character && Array.isArray(character.lorebook)) {
    character.lorebook.forEach(entry => {
      const card = createLoreBookEditorCard(entry);
      dom.loreBookList.appendChild(card);
    });
  }
}

export function selectAdminCharacter(characterId) {
  const character = state.characters.find((c) => c.id === characterId);
  if (!character) return;
  dom.characterId.value = character.id;
  dom.characterName.value = character.name;
  dom.characterPersonality.value = character.personality || "";
  dom.characterScenario.value = character.scenario || "";
  dom.characterDescription.value = character.description || "";
  dom.characterPrompt.value = character.systemPrompt || "";
  dom.characterGender.value = character.gender || "he/him";
  if (dom.characterModelSelect) {
    const val = character.model || "";
    let optionExists = false;
    for (let i = 0; i < dom.characterModelSelect.options.length; i++) {
      if (dom.characterModelSelect.options[i].value === val) {
        optionExists = true;
        break;
      }
    }
    if (!optionExists && val) {
      const option = document.createElement("option");
      option.value = val;
      option.textContent = val;
      dom.characterModelSelect.appendChild(option);
    }
    dom.characterModelSelect.value = val;
  }
  dom.characterExampleDialogs.value = character.exampleDialogs || "";
  if (dom.characterFirstMessage) dom.characterFirstMessage.value = character.firstMessage || "";
  if (dom.characterFirstMessageMode) dom.characterFirstMessageMode.value = character.firstMessageMode || "assistant";
  dom.characterTraits.value = character.traits ? character.traits.join(", ") : "";
  if (dom.characterHiddenTraits) dom.characterHiddenTraits.value = character.hiddenTraits ? character.hiddenTraits.join(", ") : "";
  if (dom.characterPresetSelect) dom.characterPresetSelect.value = "";
  dom.adminFeedback.textContent = "";
  if (dom.aiRefinerInstruction) dom.aiRefinerInstruction.value = "";
  if (dom.aiRefinerFeedback) dom.aiRefinerFeedback.textContent = "";

  // Load detailed sub-fields if present, otherwise fallback
  if (character.behavior !== undefined) {
    dom.characterAppearance.value = character.appearance || "";
    dom.characterBehavior.value = character.behavior || "";
    dom.characterBackstory.value = character.backstory || "";
    dom.characterSpeech.value = character.speech || "";
    if (dom.characterImagePrompt) dom.characterImagePrompt.value = character.imagePrompt || "";
  } else {
    dom.characterAppearance.value = "";
    dom.characterBehavior.value = character.personality || "";
    dom.characterBackstory.value = "";
    dom.characterSpeech.value = "";
    if (dom.characterImagePrompt) dom.characterImagePrompt.value = character.imagePrompt || "";
  }

  if (dom.characterAvatarUrl) {
    const avatar = character.avatarUrl || "";
    dom.characterAvatarUrl.value = avatar;
    if (dom.characterAvatarPreview) {
      if (avatar) {
        dom.characterAvatarPreview.style.backgroundImage = `url("${avatar}")`;
        dom.characterAvatarPreview.textContent = "";
      } else {
        dom.characterAvatarPreview.style.backgroundImage = "";
        dom.characterAvatarPreview.textContent = "👤";
      }
    }
  }

  // Update active states on badges
  const traits = character.traits || [];
  document.querySelectorAll(".trait-badge:not(.hidden-trait-badge)").forEach(badge => {
    const trait = badge.dataset.trait;
    if (traits.includes(trait)) {
      badge.classList.add("active");
    } else {
      badge.classList.remove("active");
    }
  });

  const hiddenTraits = character.hiddenTraits || [];
  document.querySelectorAll(".hidden-trait-badge").forEach(badge => {
    const trait = badge.dataset.trait;
    if (hiddenTraits.includes(trait)) {
      badge.classList.add("active");
    } else {
      badge.classList.remove("active");
    }
  });
  
  renderCoreStatesEditorList(character);
  renderLoreBookEditorList(character); // Load lore book list for selected character
  
  if (dom.characterForm) dom.characterForm.style.display = "flex";
  if (dom.adminWizardView) dom.adminWizardView.style.display = "none";

  // Reset active tab to first tab
  const tabButtons = document.querySelectorAll(".admin-tab-btn");
  tabButtons.forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  if (tabButtons[0]) tabButtons[0].classList.add("active");
  const firstTabContent = document.getElementById("tab-general");
  if (firstTabContent) firstTabContent.classList.add("active");
  
  renderAdminCharacterList();
}

export function renderAdminCharacterList() {
  dom.adminCharacterList.innerHTML = "";
  for (const character of state.characters) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = character.name;
    button.className = dom.characterId.value === character.id ? "active" : "";
    button.addEventListener("click", () => selectAdminCharacter(character.id));
    li.appendChild(button);
    dom.adminCharacterList.appendChild(li);
  }
}

export function updateComposerPersonaPill() {
  const activePersona = getActivePersona();
  if (!activePersona) return;
  const displayName = activePersona.userName || activePersona.name || "User";
  if (dom.composerPersonaName) {
    dom.composerPersonaName.textContent = displayName;
  }
  if (dom.playingAsPersonaName) {
    dom.playingAsPersonaName.textContent = displayName;
  }
  if (dom.composerPersonaAvatar) {
    if (activePersona.avatarUrl) {
      dom.composerPersonaAvatar.style.backgroundImage = `url('${activePersona.avatarUrl}')`;
      dom.composerPersonaAvatar.style.backgroundSize = "cover";
      dom.composerPersonaAvatar.style.backgroundPosition = "center";
      dom.composerPersonaAvatar.textContent = "";
    } else {
      dom.composerPersonaAvatar.style.backgroundImage = "";
      const initial = displayName.charAt(0).toUpperCase();
      dom.composerPersonaAvatar.textContent = initial;
    }
  }
}

export function renderPersonaList() {
  updateComposerPersonaPill();
  const personas = loadPersonas();
  const activeId = getActivePersonaId();
  const filterQuery = String(dom.searchPersonaInput?.value || "").toLowerCase().trim();

  const filtered = personas.filter(p => {
    if (!filterQuery) return true;
    const name = (p.name || "").toLowerCase();
    const userName = (p.userName || "").toLowerCase();
    const desc = (p.description || "").toLowerCase();
    return name.includes(filterQuery) || userName.includes(filterQuery) || desc.includes(filterQuery);
  });

  if (dom.personaList) {
    dom.personaList.innerHTML = "";
    for (const persona of personas) {
      const li = document.createElement("li");
      li.className = "persona-list-item";

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = persona.name + (persona.id === activeId ? " (Active)" : "");
      button.className = (dom.personaId && dom.personaId.value === persona.id ? "active " : "") + "persona-name-btn";
      button.addEventListener("click", () => selectAdminPersona(persona.id, true));
      li.appendChild(button);

      dom.personaList.appendChild(li);
    }
  }

  if (dom.personaCardList) {
    dom.personaCardList.innerHTML = "";
    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "persona-empty-state";
      empty.textContent = "No personas found.";
      dom.personaCardList.appendChild(empty);
      return;
    }

    for (const persona of filtered) {
      const card = document.createElement("li");
      const isActive = persona.id === activeId;
      card.className = `persona-card-item${isActive ? " active" : ""}`;
      
      const displayName = persona.name || persona.userName || "Persona";
      const initial = displayName.charAt(0).toUpperCase();
      const pronouns = persona.userPronouns || "he/him";
      const isDefault = persona.id === "default_persona";

      const avatarBoxHtml = persona.avatarUrl
        ? `<div class="persona-avatar-box" style="background-image: url('${persona.avatarUrl}'); background-size: cover; background-position: center;"></div>`
        : `<div class="persona-avatar-box"><span>${initial}</span></div>`;

      card.innerHTML = `
        <div class="persona-card-left">
          ${avatarBoxHtml}
          <div class="persona-card-details">
            <div class="persona-card-header-line">
              <span class="persona-card-title">${escapeHtml(displayName)}</span>
              ${pronouns ? `<span class="persona-badge pronouns">${escapeHtml(pronouns)}</span>` : ""}
              ${isDefault ? `<span class="persona-badge default">Default</span>` : ""}
              ${isActive ? `<span class="persona-badge active-tag">✓ Active</span>` : ""}
            </div>
            <p class="persona-card-desc-snippet">${escapeHtml(persona.description || "No description provided.")}</p>
          </div>
        </div>
        <div class="persona-card-actions">
          <button type="button" class="btn-edit-persona" title="Edit Persona Details">
            <svg class="feather" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path></svg>
          </button>
        </div>
      `;

      card.addEventListener("click", (e) => {
        if (e.target.closest(".btn-edit-persona")) return;
        setActivePersonaId(persona.id);
        renderPersonaList();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("persona-changed", { detail: { id: persona.id } }));
        }
      });

      const editBtn = card.querySelector(".btn-edit-persona");
      if (editBtn) {
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          selectAdminPersona(persona.id, true);
        });
      }

      dom.personaCardList.appendChild(card);
    }
  }
}

/**
 * Adopts an existing character as a User Persona, updates settings, and activates it
 */
export function adoptCharacterAsPersona(character, autoSetActive = true) {
  if (!character) return null;

  const personaData = createPersonaDataFromCharacter(character);
  const personas = loadPersonas();

  // Check if a persona for this character already exists
  const existingIdx = personas.findIndex(p => p.id === personaData.id || (p.name === personaData.name && p.id.startsWith("persona_char_")));
  if (existingIdx >= 0) {
    personas[existingIdx] = {
      ...personas[existingIdx],
      ...personaData,
      id: personas[existingIdx].id
    };
    personaData.id = personas[existingIdx].id;
  } else {
    personas.push(personaData);
  }

  savePersonas(personas);

  if (autoSetActive) {
    setActivePersonaId(personaData.id);
    state.apiSettings.userName = personaData.userName || personaData.name || "User";
    state.apiSettings.userPronouns = personaData.userPronouns || "he/him";
    
    if (dom.userNameInput) dom.userNameInput.value = state.apiSettings.userName;
    if (dom.userPronounsSelect) dom.userPronounsSelect.value = state.apiSettings.userPronouns;

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("persona-changed", { detail: { id: personaData.id } }));
    }
  }

  renderPersonaList();
  showStateNotification(`🎭 Вы теперь играете за «${personaData.name}»!`);
  setStatus(`Persona "${personaData.name}" activated.`);
  return personaData;
}

export function renderPersonaFromCharList() {
  if (!dom.personaFromCharList) return;
  dom.personaFromCharList.innerHTML = "";

  if (!state.characters || state.characters.length === 0) {
    const empty = document.createElement("div");
    empty.className = "persona-empty-state";
    empty.textContent = "Нет созданных персонажей.";
    dom.personaFromCharList.appendChild(empty);
    return;
  }

  for (const character of state.characters) {
    const li = document.createElement("li");
    li.className = "persona-card-item";
    li.style.cursor = "pointer";

    const displayName = character.name || "Персонаж";
    const initial = displayName.charAt(0).toUpperCase();
    const avatarHtml = character.avatarUrl
      ? `<div class="persona-avatar-box" style="background-image: url('${character.avatarUrl}'); background-size: cover; background-position: center;"></div>`
      : `<div class="persona-avatar-box"><span>${initial}</span></div>`;

    const descSnippet = character.description || character.personality?.slice(0, 100) || character.behavior || "Нет описания";

    li.innerHTML = `
      <div class="persona-card-left">
        ${avatarHtml}
        <div class="persona-card-details">
          <div class="persona-card-header-line">
            <span class="persona-card-title">${escapeHtml(displayName)}</span>
            ${character.gender ? `<span class="persona-badge pronouns">${escapeHtml(character.gender)}</span>` : ""}
          </div>
          <p class="persona-card-desc-snippet">${escapeHtml(descSnippet)}</p>
        </div>
      </div>
      <div class="persona-card-actions">
        <button type="button" class="btn-janitor-accent" style="padding: 6px 14px; font-size: 12px; font-weight: bold; border-radius: 6px; cursor: pointer;">
          Выбрать
        </button>
      </div>
    `;

    li.addEventListener("click", () => {
      adoptCharacterAsPersona(character, true);
      if (dom.personaFromCharSelectDialog) dom.personaFromCharSelectDialog.close();
      if (dom.personaDialog && dom.personaDialog.open) {
        selectAdminPersona(getActivePersonaId(), false);
      }
    });

    dom.personaFromCharList.appendChild(li);
  }
}

export function openPersonaFromCharDialog() {
  if (!dom.personaFromCharSelectDialog) return;
  renderPersonaFromCharList();
  dom.personaFromCharSelectDialog.showModal();
}

export function selectAdminPersona(personaId, openForm = false) {
  const personas = loadPersonas();
  let persona = personas.find(p => p.id === personaId);
  if (!persona) {
    persona = {
      id: "",
      name: "",
      userName: "",
      userPronouns: "he/him",
      description: ""
    };
  }

  if (dom.personaId) dom.personaId.value = persona.id;
  if (dom.personaNameInput) dom.personaNameInput.value = persona.name;
  if (dom.personaUserNameInput) dom.personaUserNameInput.value = persona.userName;
  if (dom.personaPronounsSelect) dom.personaPronounsSelect.value = persona.userPronouns || "he/him";
  if (dom.personaDescriptionInput) dom.personaDescriptionInput.value = persona.description || "";
  if (dom.personaFeedback) dom.personaFeedback.textContent = "";

  if (openForm) {
    if (dom.personaCardView) dom.personaCardView.style.display = "none";
    if (dom.personaEditFormContainer) dom.personaEditFormContainer.style.display = "block";
  } else {
    if (dom.personaCardView) dom.personaCardView.style.display = "block";
    if (dom.personaEditFormContainer) dom.personaEditFormContainer.style.display = "none";
  }

  updateComposerPersonaPill();
}

export function renderMemoryManager() {
  const isGm = state.sidebarTab === "gm";
  const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
  if (!activeId) return;

  const activeChatId = getActiveChatId(activeId);
  const allPinned = loadPinnedFacts();
  const pinnedList = allPinned[activeChatId] || [];

  if (dom.pinnedFactsList) {
    dom.pinnedFactsList.innerHTML = "";
    if (pinnedList.length === 0) {
      const empty = document.createElement("li");
      empty.style.color = "var(--text-muted)";
      empty.style.fontSize = "11.5px";
      empty.style.fontStyle = "italic";
      empty.textContent = "No pinned facts yet.";
      dom.pinnedFactsList.appendChild(empty);
    } else {
      pinnedList.forEach((fact, idx) => {
        const li = document.createElement("li");
        li.style.display = "flex";
        li.style.alignItems = "center";
        li.style.justifyContent = "space-between";
        li.style.gap = "6px";
        li.style.padding = "4px 8px";
        li.style.background = "rgba(255,255,255,0.03)";
        li.style.border = "1px solid rgba(255,255,255,0.08)";
        li.style.borderRadius = "6px";
        li.style.fontSize = "12px";
        li.style.color = "var(--text-primary)";

        const textSpan = document.createElement("span");
        textSpan.style.flex = "1";
        textSpan.style.wordBreak = "break-word";
        textSpan.textContent = `• ${fact}`;

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.textContent = "✕";
        delBtn.style.background = "none";
        delBtn.style.border = "none";
        delBtn.style.color = "#ef4444";
        delBtn.style.cursor = "pointer";
        delBtn.style.fontSize = "12px";
        delBtn.title = "Delete Fact";
        delBtn.addEventListener("click", () => {
          const updated = pinnedList.filter((_, i) => i !== idx);
          allPinned[activeChatId] = updated;
          savePinnedFacts(allPinned);
          renderMemoryManager();
        });

        li.appendChild(textSpan);
        li.appendChild(delBtn);
        dom.pinnedFactsList.appendChild(li);
      });
    }
  }

  if (dom.storySummaryInput && document.activeElement !== dom.storySummaryInput) {
    const summary = state.chatSummaries?.[activeChatId] || "";
    dom.storySummaryInput.value = summary;
  }

  if (dom.chatWorldGenreSelect) {
    const chatMeta = state.chatMetadata?.[activeChatId] || {};
    const char = isGm ? null : state.characters.find(c => c.id === activeId);
    dom.chatWorldGenreSelect.value = chatMeta.worldGenre || char?.worldGenre || state.apiSettings?.worldGenre || "fantasy";
  }

  // Update sidebar codex preview
  const codexMemory = getSessionMemory(activeChatId);
  updateSidebarCodexPreview(codexMemory);
}

export function updateSidebarCodexPreview(memory) {
  if (!dom.sidebarCodexLocation || !dom.sidebarCodexStatus) return;
  if (!memory) {
    dom.sidebarCodexLocation.textContent = "Не определено";
    dom.sidebarCodexStatus.textContent = "Сюжет только начинается";
    if (dom.sidebarCodexSyncBadge) dom.sidebarCodexSyncBadge.textContent = "Не создано";
    return;
  }
  const s = memory.setting || {};
  if (s.location) {
    dom.sidebarCodexLocation.textContent = `${s.location}${s.time ? ` (${s.time})` : ""}`;
  } else {
    dom.sidebarCodexLocation.textContent = "Не определено";
  }

  if (memory.current_status) {
    dom.sidebarCodexStatus.textContent = memory.current_status;
  } else {
    dom.sidebarCodexStatus.textContent = "Сюжет только начинается";
  }

  if (dom.sidebarCodexSyncBadge) {
    dom.sidebarCodexSyncBadge.textContent = memory.last_updated_message_id
      ? `Ход #${memory.last_updated_message_id}`
      : "Не создано";
  }
}

export function switchCodexTab(tabName) {
  const tabs = [
    { name: "structured", btn: dom.tabCodexStructuredBtn, view: dom.codexStructuredView },
    { name: "summary", btn: dom.tabCodexSummaryBtn, view: dom.codexSummaryView },
    { name: "json", btn: dom.tabCodexJsonBtn, view: dom.codexJsonView }
  ];

  tabs.forEach(t => {
    if (!t.btn || !t.view) return;
    if (t.name === tabName) {
      t.btn.classList.add("active");
      t.view.style.display = "block";
    } else {
      t.btn.classList.remove("active");
      t.view.style.display = "none";
    }
  });

  if (tabName === "json") {
    const memory = collectSessionCodexFromUI();
    if (dom.codexJsonInput) {
      dom.codexJsonInput.value = JSON.stringify(memory, null, 2);
    }
  }
}

export function createCodexCharacterCard(name = "", charData = {}) {
  const card = document.createElement("div");
  card.className = "codex-char-card";
  card.dataset.charName = name;

  const relStr = charData.relationships && typeof charData.relationships === "object"
    ? Object.entries(charData.relationships).map(([k, v]) => `${k}: ${v}`).join(", ")
    : "";
  const goalsStr = Array.isArray(charData.goals) ? charData.goals.join(", ") : (charData.goals || "");
  const traitsStr = Array.isArray(charData.important_traits) ? charData.important_traits.join(", ") : (charData.important_traits || "");

  card.innerHTML = `
    <div class="codex-char-header">
      <input type="text" class="codex-char-name" value="${escapeHtml(name)}" placeholder="Имя персонажа" style="font-weight: 700; color: #ffffff; background: transparent; border: none; font-size: 13px; border-bottom: 1px dashed rgba(255,255,255,0.2); width: 60%;" />
      <button type="button" class="btn-delete-codex-char" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 14px;" title="Удалить персонажа">&times;</button>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px;">
      <div>
        <label style="color: var(--text-muted);">Физическое состояние:</label>
        <input type="text" class="codex-char-physical" value="${escapeHtml(charData.physical_state || "")}" placeholder="Ранения, одежда..." style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px; color: var(--text-primary); font-size: 11.5px;" />
      </div>
      <div>
        <label style="color: var(--text-muted);">Эмоциональное состояние:</label>
        <input type="text" class="codex-char-emotional" value="${escapeHtml(charData.emotional_state || "")}" placeholder="Настроение, стресс..." style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px; color: var(--text-primary); font-size: 11.5px;" />
      </div>
      <div style="grid-column: span 2;">
        <label style="color: var(--text-muted);">Отношения к другим (Имя: Статус):</label>
        <input type="text" class="codex-char-relationships" value="${escapeHtml(relStr)}" placeholder="User: Доверяет, Leo: Соперник" style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px; color: var(--text-primary); font-size: 11.5px;" />
      </div>
      <div>
        <label style="color: var(--text-muted);">Цели (через запятую):</label>
        <input type="text" class="codex-char-goals" value="${escapeHtml(goalsStr)}" placeholder="Спасти сестру, найти карту" style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px; color: var(--text-primary); font-size: 11.5px;" />
      </div>
      <div>
        <label style="color: var(--text-muted);">Черты (через запятую):</label>
        <input type="text" class="codex-char-traits" value="${escapeHtml(traitsStr)}" placeholder="Храбрая, скрытная" style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px; color: var(--text-primary); font-size: 11.5px;" />
      </div>
      <div style="grid-column: span 2;">
        <label style="color: var(--text-muted);">Заметки и секреты:</label>
        <input type="text" class="codex-char-notes" value="${escapeHtml(charData.notes || "")}" placeholder="Хранит медальон погибшего отца" style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px; color: var(--text-primary); font-size: 11.5px;" />
      </div>
    </div>
  `;

  card.querySelector(".btn-delete-codex-char").addEventListener("click", () => {
    card.remove();
  });

  return card;
}

export function createCodexThreadItem(threadText = "") {
  const li = document.createElement("li");
  li.className = "codex-thread-item";
  li.innerHTML = `
    <span class="thread-text" style="flex: 1; word-break: break-word;">📌 ${escapeHtml(threadText)}</span>
    <button type="button" class="btn-delete-thread" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 13px;" title="Удалить нить">&times;</button>
  `;
  li.querySelector(".btn-delete-thread").addEventListener("click", () => {
    li.remove();
  });
  return li;
}

export function createCodexEventItem(eventData = {}) {
  const card = document.createElement("div");
  card.className = "codex-event-card";
  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
      <input type="text" class="codex-event-summary" value="${escapeHtml(eventData.summary || "")}" placeholder="Что произошло (напр.: Сбежали от стражи через крышу)" style="flex: 1; font-weight: 600; color: #ffffff; background: transparent; border: none; font-size: 12px; border-bottom: 1px dashed rgba(255,255,255,0.15);" />
      <button type="button" class="btn-delete-event" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 13px; margin-left: 8px;" title="Удалить событие">&times;</button>
    </div>
    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 6px; font-size: 11px;">
      <input type="text" class="codex-event-consequences" value="${escapeHtml(eventData.consequences || "")}" placeholder="Последствия (напр.: Стража теперь их разыскивает)" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px; color: var(--text-primary); font-size: 11px;" />
      <input type="text" class="codex-event-timestamp" value="${escapeHtml(eventData.timestamp || "")}" placeholder="Время / Ход (напр.: Ход 5)" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px; color: var(--text-primary); font-size: 11px;" />
    </div>
  `;
  card.querySelector(".btn-delete-event").addEventListener("click", () => {
    card.remove();
  });
  return card;
}

export function collectSessionCodexFromUI() {
  const activeId = state.sidebarTab === "gm" ? state.activeGmSceneId : state.activeCharacterId;
  const activeChatId = getActiveChatId(activeId);
  const currentMem = getSessionMemory(activeChatId) || createDefaultSessionMemory();

  // Setting
  const setting = {
    location: dom.codexLocationInput ? dom.codexLocationInput.value.trim() : "",
    time: dom.codexTimeInput ? dom.codexTimeInput.value.trim() : "",
    atmosphere: dom.codexAtmosphereInput ? dom.codexAtmosphereInput.value.trim() : "",
    world_rules: dom.codexWorldRulesInput
      ? dom.codexWorldRulesInput.value.split(",").map(s => s.trim()).filter(Boolean)
      : []
  };

  // Characters
  const characters = {};
  if (dom.codexCharactersList) {
    const cards = dom.codexCharactersList.querySelectorAll(".codex-char-card");
    cards.forEach(card => {
      const nameInput = card.querySelector(".codex-char-name");
      const name = nameInput ? nameInput.value.trim() : "";
      if (!name) return;

      const physical = card.querySelector(".codex-char-physical")?.value.trim() || "";
      const emotional = card.querySelector(".codex-char-emotional")?.value.trim() || "";
      const relRaw = card.querySelector(".codex-char-relationships")?.value.trim() || "";
      const goalsRaw = card.querySelector(".codex-char-goals")?.value.trim() || "";
      const traitsRaw = card.querySelector(".codex-char-traits")?.value.trim() || "";
      const notes = card.querySelector(".codex-char-notes")?.value.trim() || "";

      const relationships = {};
      if (relRaw) {
        relRaw.split(";").join(",").split(",").forEach(part => {
          const colonIdx = part.indexOf(":");
          if (colonIdx !== -1) {
            const k = part.substring(0, colonIdx).trim();
            const v = part.substring(colonIdx + 1).trim();
            if (k) relationships[k] = v;
          }
        });
      }

      characters[name] = {
        physical_state: physical,
        emotional_state: emotional,
        relationships,
        goals: goalsRaw ? goalsRaw.split(",").map(g => g.trim()).filter(Boolean) : [],
        important_traits: traitsRaw ? traitsRaw.split(",").map(t => t.trim()).filter(Boolean) : [],
        notes
      };
    });
  }

  // Intimate notes
  const intimate_notes = {
    dynamics: dom.codexIntimateDynamicsInput ? dom.codexIntimateDynamicsInput.value.trim() : "",
    boundaries: dom.codexBoundariesInput
      ? dom.codexBoundariesInput.value.split(",").map(s => s.trim()).filter(Boolean)
      : [],
    preferences: dom.codexPreferencesInput
      ? dom.codexPreferencesInput.value.split(",").map(s => s.trim()).filter(Boolean)
      : [],
    recent_events: dom.codexRecentIntimateEventsInput
      ? dom.codexRecentIntimateEventsInput.value.split(";").map(s => s.trim()).filter(Boolean)
      : []
  };

  // Unresolved threads
  const unresolved_threads = [];
  if (dom.codexThreadsList) {
    const items = dom.codexThreadsList.querySelectorAll(".codex-thread-item .thread-text");
    items.forEach(it => {
      const text = it.textContent.replace(/^📌\s*/, "").trim();
      if (text) unresolved_threads.push(text);
    });
  }

  // Key events
  const key_events = [];
  if (dom.codexEventsList) {
    const cards = dom.codexEventsList.querySelectorAll(".codex-event-card");
    cards.forEach(card => {
      const summary = card.querySelector(".codex-event-summary")?.value.trim() || "";
      if (!summary) return;
      const consequences = card.querySelector(".codex-event-consequences")?.value.trim() || "";
      const timestamp = card.querySelector(".codex-event-timestamp")?.value.trim() || "";
      key_events.push({ summary, consequences, timestamp });
    });
  }

  return {
    setting,
    characters,
    key_events,
    unresolved_threads,
    intimate_notes,
    current_status: dom.codexCurrentStatusInput ? dom.codexCurrentStatusInput.value.trim() : "",
    last_updated_message_id: currentMem.last_updated_message_id || 0
  };
}

export function renderSessionCodex(chatId) {
  if (!chatId) return;
  const memory = getSessionMemory(chatId) || createDefaultSessionMemory();

  // Status badge
  if (dom.codexStatusBadge) {
    if (memory.last_updated_message_id) {
      dom.codexStatusBadge.textContent = `● Синхронизировано до хода #${memory.last_updated_message_id}`;
      dom.codexStatusBadge.style.color = "#ffffff";
      dom.codexStatusBadge.style.borderColor = "rgba(255, 255, 255, 0.35)";
    } else {
      dom.codexStatusBadge.textContent = "● Начальное состояние";
      dom.codexStatusBadge.style.color = "var(--text-secondary, #a1a1aa)";
      dom.codexStatusBadge.style.borderColor = "rgba(255, 255, 255, 0.15)";
    }
  }

  // Current status
  if (dom.codexCurrentStatusInput) {
    dom.codexCurrentStatusInput.value = memory.current_status || "";
  }

  // Setting
  const s = memory.setting || {};
  if (dom.codexLocationInput) dom.codexLocationInput.value = s.location || "";
  if (dom.codexTimeInput) dom.codexTimeInput.value = s.time || "";
  if (dom.codexAtmosphereInput) dom.codexAtmosphereInput.value = s.atmosphere || "";
  if (dom.codexWorldRulesInput) {
    dom.codexWorldRulesInput.value = Array.isArray(s.world_rules) ? s.world_rules.join(", ") : "";
  }

  // Intimate dynamics
  const im = memory.intimate_notes || {};
  if (dom.codexIntimateDynamicsInput) dom.codexIntimateDynamicsInput.value = im.dynamics || "";
  if (dom.codexBoundariesInput) {
    dom.codexBoundariesInput.value = Array.isArray(im.boundaries) ? im.boundaries.join(", ") : "";
  }
  if (dom.codexPreferencesInput) {
    dom.codexPreferencesInput.value = Array.isArray(im.preferences) ? im.preferences.join(", ") : "";
  }
  if (dom.codexRecentIntimateEventsInput) {
    dom.codexRecentIntimateEventsInput.value = Array.isArray(im.recent_events) ? im.recent_events.join("; ") : "";
  }

  // Characters
  if (dom.codexCharactersList) {
    dom.codexCharactersList.innerHTML = "";
    const chars = memory.characters || {};
    const charNames = Object.keys(chars);
    if (charNames.length === 0) {
      const activeChar = state.characters.find(c => c.id === state.activeCharacterId);
      if (activeChar) {
        dom.codexCharactersList.appendChild(createCodexCharacterCard(activeChar.name, {}));
      }
    } else {
      charNames.forEach(name => {
        dom.codexCharactersList.appendChild(createCodexCharacterCard(name, chars[name]));
      });
    }
  }

  // Threads
  if (dom.codexThreadsList) {
    dom.codexThreadsList.innerHTML = "";
    (memory.unresolved_threads || []).forEach(th => {
      dom.codexThreadsList.appendChild(createCodexThreadItem(th));
    });
  }

  // Events
  if (dom.codexEventsList) {
    dom.codexEventsList.innerHTML = "";
    (memory.key_events || []).forEach(ev => {
      dom.codexEventsList.appendChild(createCodexEventItem(ev));
    });
  }

  // JSON
  if (dom.codexJsonInput) {
    dom.codexJsonInput.value = JSON.stringify(memory, null, 2);
  }

  // Update sidebar preview
  updateSidebarCodexPreview(memory);
}


export function createWorldLoreCard(name = "", description = "") {
  const card = document.createElement("div");
  card.className = "world-lore-card";
  card.style.display = "flex";
  card.style.flexDirection = "column";
  card.style.gap = "6px";
  card.style.padding = "8px 10px";
  card.style.background = "rgba(255,255,255,0.03)";
  card.style.border = "1px solid rgba(255,255,255,0.1)";
  card.style.borderRadius = "6px";

  card.innerHTML = `
    <div style="display: flex; gap: 6px; align-items: center;">
      <input type="text" class="world-lore-card-name state-input-small" placeholder="Название (напр.: Королевство Валория)" value="${escapeHtml(name)}" style="flex: 1; font-weight: 600; font-size: 12px; color: var(--text-primary);" />
      <button type="button" class="btn-delete-card" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 14px;" title="Удалить карточку">&times;</button>
    </div>
    <textarea class="world-lore-card-desc textarea-wide-tall" placeholder="Описание, устройство, история и особенности..." style="height: 48px; font-size: 12px; margin: 0; min-height: 38px;">${escapeHtml(description)}</textarea>
  `;

  card.querySelector(".btn-delete-card").addEventListener("click", () => {
    card.remove();
  });

  return card;
}

export function createCoreStateEditorCard(stateData = null) {
  const card = document.createElement("div");
  card.className = "core-state-editor-card";
  
  const key = stateData ? stateData.key : "";
  const displayName = stateData ? stateData.displayName : "";
  const color = stateData ? (stateData.color || "purple") : "purple";
  const stages = stateData && Array.isArray(stateData.stages) ? stateData.stages : ["", "", "", "", "", ""];
  const rawDefaultValue = stateData ? (stateData.defaultValue ?? 20) : 20;
  const defaultValue = parseNumericStateValue(rawDefaultValue, stages);
  
  card.innerHTML = `
    <div style="display: flex; gap: 8px; align-items: center;">
      <input type="text" placeholder="Key (e.g., curiosity)" class="core-state-key" style="flex: 1;" value="${escapeHtml(key)}" required />
      <input type="text" placeholder="Display Name (e.g., Любопытство)" class="core-state-display-name" style="flex: 1;" value="${escapeHtml(displayName)}" required />
    </div>
    <div style="display: flex; gap: 8px; align-items: center;">
      <div style="display: flex; align-items: center; gap: 4px; flex: 1;">
        <span style="font-size: 0.85em; color: var(--text-secondary);">Default:</span>
        <input type="number" min="0" max="100" class="core-state-default" style="width: 60px;" value="${defaultValue}" />
      </div>
      <div style="display: flex; align-items: center; gap: 4px; flex: 1;">
        <span style="font-size: 0.85em; color: var(--text-secondary);">Color:</span>
        <select class="core-state-color" style="flex: 1; padding: 4px;">
          <option value="purple" ${color === 'purple' ? 'selected' : ''}>Purple</option>
          <option value="red" ${color === 'red' ? 'selected' : ''}>Red</option>
          <option value="green" ${color === 'green' ? 'selected' : ''}>Green</option>
          <option value="blue" ${color === 'blue' ? 'selected' : ''}>Blue</option>
          <option value="yellow" ${color === 'yellow' ? 'selected' : ''}>Yellow</option>
        </select>
      </div>
      <button type="button" class="delete-core-state-btn" style="background: transparent; border: none; color: #e05555; padding: 4px 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Delete State"><svg class="feather" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
    </div>
    <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px; border-top: 1px dashed var(--border); padding-top: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
        <span style="font-size: 0.85em; font-weight: bold; color: var(--text-secondary);">6 Stages (Russian):</span>
        <button type="button" class="generate-stages-btn" style="font-size: 0.8em; padding: 2px 8px; background: rgba(255,255,255,0.08); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); cursor: pointer; display: inline-flex; align-items: center; gap: 4px;"><svg class="feather" viewBox="0 0 24 24"><line x1="18" y1="2" x2="22" y2="6"></line><path d="M7.5 20.5 19 9l-4-4L3.5 16.5 2 22z"></path></svg> Auto-generate stages</button>
      </div>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px;">
        <input type="text" placeholder="Stage 1 (0-16)" class="core-state-stage-0" value="${escapeHtml(stages[0] || '')}" required />
        <input type="text" placeholder="Stage 2 (17-33)" class="core-state-stage-1" value="${escapeHtml(stages[1] || '')}" required />
        <input type="text" placeholder="Stage 3 (34-50)" class="core-state-stage-2" value="${escapeHtml(stages[2] || '')}" required />
        <input type="text" placeholder="Stage 4 (51-66)" class="core-state-stage-3" value="${escapeHtml(stages[3] || '')}" required />
        <input type="text" placeholder="Stage 5 (67-83)" class="core-state-stage-4" value="${escapeHtml(stages[4] || '')}" required />
        <input type="text" placeholder="Stage 6 (84-100)" class="core-state-stage-5" value="${escapeHtml(stages[5] || '')}" required />
      </div>
    </div>
  `;
  
  card.querySelector(".delete-core-state-btn").onclick = () => {
    card.remove();
  };
  
  const genBtn = card.querySelector(".generate-stages-btn");
  genBtn.onclick = () => {
    const keyInput = card.querySelector(".core-state-key");
    const stateKey = keyInput.value.trim();
    if (!stateKey) {
      alert("Please enter a state key first (e.g. curiosity)");
      return;
    }
    genBtn.disabled = true;
    genBtn.innerHTML = '<span class="state-loading-spinner" style="width:12px; height:12px; border-width:2px; margin-right:4px;"></span> Generating...';
    const tempChar = {
      name: dom.characterName.value.trim() || "Character",
      personality: dom.characterPersonality.value.trim() || "",
      description: dom.characterDescription.value.trim() || ""
    };
    
    if (generateStagesCallback) {
      generateStagesCallback(tempChar, stateKey).then(stagesGenerated => {
        genBtn.disabled = false;
        genBtn.innerHTML = '<svg class="feather" viewBox="0 0 24 24"><line x1="18" y1="2" x2="22" y2="6"></line><path d="M7.5 20.5 19 9l-4-4L3.5 16.5 2 22z"></path></svg> Auto-generate stages';
        if (stagesGenerated && stagesGenerated.length === 6) {
          stagesGenerated.forEach((stage, idx) => {
            const stageInput = card.querySelector(`.core-state-stage-${idx}`);
            if (stageInput) stageInput.value = stage;
          });
        } else {
          alert("Failed to generate stages. Check API settings or enter them manually.");
        }
      });
    }
  };
  
  return card;
}

// --- Create LoreBook Editor Card ---
export function createLoreBookEditorCard(entry = null) {
  const card = document.createElement("div");
  card.className = "core-state-editor-card";
  
  const keys = entry ? entry.keys : "";
  const content = entry ? entry.content : "";
  const enabled = entry ? entry.enabled !== false : true;

  card.innerHTML = `
    <div style="display: flex; gap: 8px; align-items: center;">
      <input type="text" placeholder="Triggers (e.g. sword, blade) or /regex/i" class="lore-entry-keys" style="flex: 1; margin: 0;" value="${escapeHtml(keys)}" required />
      <button type="button" class="generate-lore-triggers-btn" style="font-size: 0.85em; padding: 6px 12px; background: rgba(255,255,255,0.08); border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary); cursor: pointer; display: flex; align-items: center; justify-content: center; width: 34px;" title="Generate related triggers using AI"><svg class="feather" viewBox="0 0 24 24"><line x1="18" y1="2" x2="22" y2="6"></line><path d="M7.5 20.5 19 9l-4-4L3.5 16.5 2 22z"></path></svg></button>
      <label style="display: flex; flex-direction: row; gap: 4px; align-items: center; margin: 0; font-size: 11px; font-weight: normal; cursor: pointer; white-space: nowrap;">
        <input type="checkbox" class="lore-entry-enabled" ${enabled ? "checked" : ""} style="width: auto; margin: 0;" /> Active
      </label>
      <button type="button" class="delete-lore-entry-btn" style="background: transparent; border: none; color: #e05555; padding: 4px 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Delete Entry"><svg class="feather" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2-2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
    </div>
    <div style="margin-top: 4px; display: flex; gap: 8px; align-items: stretch;">
      <textarea placeholder="Lore content (will be injected into prompt when triggers match)" class="lore-entry-content" style="flex: 1; min-height: 50px; margin: 0; font-size: 12.5px;" required>${escapeHtml(content)}</textarea>
      <button type="button" class="improve-lore-content-btn" style="font-size: 0.85em; padding: 6px 10px; background: rgba(255,255,255,0.08); border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary); cursor: pointer; display: flex; align-items: center; justify-content: center; width: 34px;" title="Generate or improve description using AI"><svg class="feather" viewBox="0 0 24 24"><line x1="18" y1="2" x2="22" y2="6"></line><path d="M7.5 20.5 19 9l-4-4L3.5 16.5 2 22z"></path></svg></button>
    </div>
  `;

  card.querySelector(".delete-lore-entry-btn").onclick = () => card.remove();

  const genBtn = card.querySelector(".generate-lore-triggers-btn");
  const keysInput = card.querySelector(".lore-entry-keys");
  const contentTextarea = card.querySelector(".lore-entry-content");
  
  genBtn.onclick = () => {
    const topic = keysInput.value.trim() || "lore subject";
    const detail = contentTextarea.value.trim();
    
    genBtn.disabled = true;
    genBtn.innerHTML = '<span class="state-loading-spinner" style="width:12px; height:12px; border-width:2px; margin:0;"></span>';
    
    if (generateLoreTriggersCallback) {
      generateLoreTriggersCallback(topic, detail).then(generatedKeys => {
        genBtn.disabled = false;
        genBtn.innerHTML = '<svg class="feather" viewBox="0 0 24 24"><line x1="18" y1="2" x2="22" y2="6"></line><path d="M7.5 20.5 19 9l-4-4L3.5 16.5 2 22z"></path></svg>';
        if (generatedKeys) {
          keysInput.value = generatedKeys;
        } else {
          alert("Failed to generate triggers. Please check your API key or fill them manually.");
        }
      });
    }
  };

  const improveBtn = card.querySelector(".improve-lore-content-btn");
  improveBtn.onclick = () => {
    const topic = keysInput.value.trim() || "lore subject";
    const currentContent = contentTextarea.value.trim();
    
    improveBtn.disabled = true;
    improveBtn.innerHTML = '<span class="state-loading-spinner" style="width:12px; height:12px; border-width:2px; margin:0;"></span>';
    
    if (improveLoreContentCallback) {
      improveLoreContentCallback(topic, currentContent).then(improvedText => {
        improveBtn.disabled = false;
        improveBtn.innerHTML = '<svg class="feather" viewBox="0 0 24 24"><line x1="18" y1="2" x2="22" y2="6"></line><path d="M7.5 20.5 19 9l-4-4L3.5 16.5 2 22z"></path></svg>';
        if (improvedText) {
          contentTextarea.value = improvedText;
        } else {
          alert("Failed to generate or improve lore content. Check your API settings.");
        }
      });
    }
  };

  return card;
}

// --- Internal Helper Functions ---

function getActiveCharacter() {
  return state.characters.find((c) => c.id === state.activeCharacterId) || null;
}

function getStagesForState(characterId, stateKey) {
  if (state.customStateStages[characterId] && state.customStateStages[characterId][stateKey]) {
    return state.customStateStages[characterId][stateKey];
  }
  return null;
}

function parseNumericStateValue(value, stages = []) {
  if (value === undefined || value === null) return 20;
  const num = Number(value);
  if (!isNaN(num)) {
    return num;
  }
  if (typeof value === "string" && Array.isArray(stages) && stages.length > 0) {
    const cleanVal = value.trim().toLowerCase();
    const idx = stages.findIndex(s => s && s.trim().toLowerCase() === cleanVal);
    if (idx !== -1) {
      if (stages.length > 1) {
        return Math.round((idx / (stages.length - 1)) * 100);
      }
      return 50;
    }
  }
  return 20;
}

function getStageIndexForValue(value) {
  const val = Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
  if (val <= 16) return 0;
  if (val <= 33) return 1;
  if (val <= 50) return 2;
  if (val <= 66) return 3;
  if (val <= 83) return 4;
  return 5;
}

function showContextMenu(msgIndex, x, y) {
  hideContextMenu();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.position = "absolute";
  menu.style.left = x + "px";
  menu.style.top = y + "px";

  const isGm = state.sidebarTab === "gm";
  const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
  if (!activeId) return;

  const activeChatId = getActiveChatId(activeId);
  const chat = state.chats[activeChatId] || [];
  const msg = chat[msgIndex];
  if (!msg) return;

  const actions = [];

  if (msg.role === "user" || msg.role === "assistant") {
    actions.push({ 
      label: "Edit", 
      action: () => {
        const article = dom.messages.querySelector(`article[data-index="${msgIndex}"]`);
        if (article) {
          const dialogueEl = article.querySelector(".message-dialogue");
          const parsed = parseThoughtAndContent(msg.content);
          startInlineEdit(article, msgIndex, msg, dialogueEl, parsed);
        }
      } 
    });
  }

  actions.push({ 
    label: "Reply", 
    action: () => {
      if (replyMessageCallback) replyMessageCallback(msgIndex);
    } 
  });
  
  actions.push({ 
    label: "Copy", 
    action: () => {
      navigator.clipboard.writeText(msg.content).then(() => {
        setStatus("Message copied!");
      }).catch(() => {
        setStatus("Copy failed.");
      });
    } 
  });



  actions.push({ 
    label: "Delete", 
    action: () => {
      if (deleteMessageCallback) deleteMessageCallback(msgIndex);
    } 
  });

  for (const { label, action: act } of actions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      hideContextMenu();
      act();
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  document.addEventListener("click", hideContextMenu, { once: true });
}

function hideContextMenu() {
  const existing = document.querySelector(".context-menu");
  if (existing) existing.remove();
}

/**
 * Mobile replacement for the inline action bar.
 *
 * On touch screens the inline bar cannot rely on hover, so it used to render
 * all 7 buttons permanently under every message - a lot of chrome per bubble.
 * This opens a bottom sheet with labelled rows instead, driven by the very
 * same buttons so behaviour cannot drift apart.
 */
function openMobileActionSheet(actionsBar) {
  const openSheet = document.querySelector(".action-sheet-backdrop");
  if (openSheet) openSheet.remove();

  const buttons = [...actionsBar.querySelectorAll(".action-btn")];
  if (buttons.length === 0) return;

  const backdrop = document.createElement("div");
  backdrop.className = "action-sheet-backdrop";

  const sheet = document.createElement("div");
  sheet.className = "action-sheet";
  sheet.setAttribute("role", "menu");

  const grabber = document.createElement("div");
  grabber.className = "action-sheet-grabber";
  sheet.appendChild(grabber);

  buttons.forEach(btn => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "action-sheet-row";
    row.setAttribute("role", "menuitem");
    if (btn.dataset.danger) row.classList.add("danger");
    if (btn.classList.contains("active")) row.classList.add("active");

    const icon = document.createElement("span");
    icon.className = "action-sheet-row-icon";
    icon.textContent = btn.dataset.icon || "";
    row.appendChild(icon);

    const label = document.createElement("span");
    label.className = "action-sheet-row-label";
    label.textContent = btn.dataset.label || btn.title || "";
    row.appendChild(label);

    row.addEventListener("click", (e) => {
      e.stopPropagation();
      closeSheet();
      // delegate to the real action so behaviour stays in one place
      btn.click();
    });

    sheet.appendChild(row);
  });

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "action-sheet-cancel";
  cancel.textContent = "Отмена";
  cancel.addEventListener("click", (e) => {
    e.stopPropagation();
    closeSheet();
  });
  sheet.appendChild(cancel);

  function closeSheet() {
    backdrop.remove();
    document.removeEventListener("keydown", onKeydown);
  }

  function onKeydown(e) {
    if (e.key === "Escape") closeSheet();
  }

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeSheet();
  });
  document.addEventListener("keydown", onKeydown);

  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
}

function initCharacterFormFeatures() {
  function setHelperBtnLoading(btn, isLoading) {
    if (!btn) return;
    if (isLoading) {
      btn.disabled = true;
      btn.innerHTML = `<span class="state-loading-spinner" style="width:12.5px; height:12.5px; border-width:2px; margin-right:6px; display:inline-block; vertical-align:middle;"></span> Генерирую...`;
    } else {
      btn.disabled = false;
      btn.innerHTML = `<svg class="feather" viewBox="0 0 24 24" style="width: 14px; height: 14px; stroke: currentColor; stroke-width: 2; fill: none; display: inline-block; vertical-align: middle; margin-right: 6px;"><line x1="18" y1="2" x2="22" y2="6"></line><path d="M7.5 20.5 19 9l-4-4L3.5 16.5 2 22z"></path></svg> AI Помощник`;
    }
  }

  // 1. Tabs event listener
  const tabButtons = document.querySelectorAll(".admin-tab-btn");
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      
      btn.classList.add("active");
      const tabId = `tab-${btn.dataset.tab}`;
      const content = document.getElementById(tabId);
      if (content) content.classList.add("active");
    });
  });

  // 2. Traits badges click handler
  const traitsInput = document.getElementById("characterTraits");
  const badges = document.querySelectorAll(".trait-badge:not(.hidden-trait-badge)");
  if (traitsInput && badges.length > 0) {
    badges.forEach(badge => {
      badge.addEventListener("click", () => {
        const traitName = badge.dataset.trait;
        let traitsList = traitsInput.value.split(",")
          .map(t => t.trim())
          .filter(t => t.length > 0);
        
        if (traitsList.includes(traitName)) {
          traitsList = traitsList.filter(t => t !== traitName);
          badge.classList.remove("active");
        } else {
          traitsList.push(traitName);
          badge.classList.add("active");
        }
        traitsInput.value = traitsList.join(", ");
      });
    });

    traitsInput.addEventListener("input", () => {
      const traitsList = traitsInput.value.split(",")
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0);
      badges.forEach(badge => {
        const traitName = badge.dataset.trait.toLowerCase();
        if (traitsList.includes(traitName)) {
          badge.classList.add("active");
        } else {
          badge.classList.remove("active");
        }
      });
    });
  }

  // 2b. Hidden Traits badges click handler
  const hiddenTraitsInput = document.getElementById("characterHiddenTraits");
  const hiddenBadges = document.querySelectorAll(".hidden-trait-badge");
  if (hiddenTraitsInput && hiddenBadges.length > 0) {
    hiddenBadges.forEach(badge => {
      badge.addEventListener("click", () => {
        const traitName = badge.dataset.trait;
        let traitsList = hiddenTraitsInput.value.split(",")
          .map(t => t.trim())
          .filter(t => t.length > 0);
        
        if (traitsList.includes(traitName)) {
          traitsList = traitsList.filter(t => t !== traitName);
          badge.classList.remove("active");
        } else {
          traitsList.push(traitName);
          badge.classList.add("active");
        }
        hiddenTraitsInput.value = traitsList.join(", ");
      });
    });

    hiddenTraitsInput.addEventListener("input", () => {
      const traitsList = hiddenTraitsInput.value.split(",")
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0);
      hiddenBadges.forEach(badge => {
        const traitName = badge.dataset.trait.toLowerCase();
        if (traitsList.includes(traitName)) {
          badge.classList.add("active");
        } else {
          badge.classList.remove("active");
        }
      });
    });
  }

  // Avatar upload & preview handlers
  if (dom.uploadAvatarBtn && dom.characterAvatarFileInput) {
    dom.uploadAvatarBtn.addEventListener("click", () => {
      dom.characterAvatarFileInput.click();
    });
    dom.characterAvatarFileInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        if (dom.characterAvatarUrl) dom.characterAvatarUrl.value = dataUrl;
        if (dom.characterAvatarPreview) {
          dom.characterAvatarPreview.style.backgroundImage = `url("${dataUrl}")`;
          dom.characterAvatarPreview.textContent = "";
        }
      };
      reader.readAsDataURL(file);
    });
  }

  if (dom.clearAvatarBtn) {
    dom.clearAvatarBtn.addEventListener("click", () => {
      if (dom.characterAvatarUrl) dom.characterAvatarUrl.value = "";
      if (dom.characterAvatarFileInput) dom.characterAvatarFileInput.value = "";
      if (dom.characterAvatarPreview) {
        dom.characterAvatarPreview.style.backgroundImage = "";
        dom.characterAvatarPreview.textContent = "👤";
      }
    });
  }

  if (dom.characterAvatarUrl) {
    dom.characterAvatarUrl.addEventListener("input", () => {
      const url = dom.characterAvatarUrl.value.trim();
      if (dom.characterAvatarPreview) {
        if (url) {
          dom.characterAvatarPreview.style.backgroundImage = `url("${url}")`;
          dom.characterAvatarPreview.textContent = "";
        } else {
          dom.characterAvatarPreview.style.backgroundImage = "";
          dom.characterAvatarPreview.textContent = "👤";
        }
      }
    });
  }

  // 3. Dialogue template insert buttons
  const exampleDialogs = document.getElementById("characterExampleDialogs");
  const insertStartBtn = document.getElementById("insertStartBtn");
  const insertCharBtn = document.getElementById("insertCharBtn");
  const insertUserBtn = document.getElementById("insertUserBtn");
  
  const insertText = (txt) => {
    if (!exampleDialogs) return;
    const start = exampleDialogs.selectionStart;
    const end = exampleDialogs.selectionEnd;
    const currentVal = exampleDialogs.value;
    exampleDialogs.value = currentVal.substring(0, start) + txt + currentVal.substring(end);
    exampleDialogs.focus();
    exampleDialogs.selectionStart = exampleDialogs.selectionEnd = start + txt.length;
  };
  
  if (insertStartBtn) insertStartBtn.addEventListener("click", () => insertText("<START>\n"));
  if (insertCharBtn) insertCharBtn.addEventListener("click", () => insertText("{{char}}: "));
  if (insertUserBtn) insertUserBtn.addEventListener("click", () => insertText("{{user}}: "));

  // 4. AI Magic helpers
  const generateNameBtn = document.getElementById("generateNameBtn");
  const generateDescBtn = document.getElementById("generateDescriptionBtn");
  const generateTraitsBtn = document.getElementById("generateTraitsBtn");
  const generateAppBtn = document.getElementById("generateAppearanceBtn");
  const generateBehavBtn = document.getElementById("generateBehaviorBtn");
  const generateBackBtn = document.getElementById("generateBackstoryBtn");
  const generateSpeechBtn = document.getElementById("generateSpeechStyleBtn");
  const generatePromptBtn = document.getElementById("generatePromptBtn");
  const generateScenBtn = document.getElementById("generateScenarioBtn");
  const generateFirstMsgBtn = document.getElementById("generateFirstMessageBtn");
  const generateExBtn = document.getElementById("generateExamplesBtn");

  if (generateNameBtn) {
    generateNameBtn.addEventListener("click", async () => {
      const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
      if (apiConfig.baseUrl === null && !apiConfig.apiKey) { alert("Укажите API-ключ OpenRouter в настройках."); return; }
      
      const gender = dom.characterGender.value;
      const desc = dom.characterDescription.value.trim() || "любой персонаж";
      
      setHelperBtnLoading(generateNameBtn, true);
      
      try {
        const prompt = `Сгенерируй одно интересное имя для персонажа ролевой игры.
Пол персонажа: ${gender === "he/him" ? "мужской" : gender === "she/her" ? "женский" : "небинарный"}.
Краткая концепция/описание: ${desc}.
Имя должно быть атмосферным и соответствовать концепции.
Выведи ТОЛЬКО имя (одно или два слова), без кавычек, объяснений и знаков препинания.`;

        const res = await sendMessageNonStream({
          apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: dom.characterModelSelect?.value || apiConfig.model,
          messages: [{ role: "user", content: prompt }], temperature: 0.8, maxTokens: 50
        });
        
        let cleanedRes = res.trim();
        cleanedRes = cleanedRes.replace(/^\s*```[a-z]*\n([\s\S]*?)\n```\s*$/i, '$1').trim();
        if (!cleanedRes) throw new Error("Модель вернула пустой ответ");
        
        dom.characterName.value = cleanedRes.replace(/^["']|["']$/g, "");
      } catch (err) {
        alert(`Ошибка: ${err.message}`);
      } finally {
        setHelperBtnLoading(generateNameBtn, false);
      }
    });
  }

  if (generateDescBtn) {
    generateDescBtn.addEventListener("click", async () => {
      const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
      if (apiConfig.baseUrl === null && !apiConfig.apiKey) { alert("Укажите API-ключ OpenRouter в настройках."); return; }
      
      const charName = dom.characterName.value.trim() || "Персонаж";
      const traits = dom.characterTraits.value.trim() || "без выраженных черт";
      
      setHelperBtnLoading(generateDescBtn, true);
      
      try {
        const prompt = `Напиши краткое описание (однострочник / summary) для персонажа по имени "${charName}".
Его ключевые черты: "${traits}".
Например: "Высокомерный маг-отступник, ищущий древнее знание" или "Веселая девушка-хакер из неблагополучного района".
Выведи ТОЛЬКО описание (до 10 слов) на русском языке, без кавычек и вводных фраз.`;

        const res = await sendMessageNonStream({
          apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: dom.characterModelSelect?.value || apiConfig.model,
          messages: [{ role: "user", content: prompt }], temperature: 0.8, maxTokens: 80
        });
        
        let cleanedRes = res.trim();
        cleanedRes = cleanedRes.replace(/^\s*```[a-z]*\n([\s\S]*?)\n```\s*$/i, '$1').trim();
        if (!cleanedRes) throw new Error("Модель вернула пустой ответ");
        
        dom.characterDescription.value = cleanedRes.replace(/^["']|["']$/g, "");
      } catch (err) {
        alert(`Ошибка: ${err.message}`);
      } finally {
        setHelperBtnLoading(generateDescBtn, false);
      }
    });
  }

  if (generateTraitsBtn) {
    generateTraitsBtn.addEventListener("click", async () => {
      const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
      if (apiConfig.baseUrl === null && !apiConfig.apiKey) { alert("Укажите API-ключ OpenRouter в настройках."); return; }
      
      const charName = dom.characterName.value.trim() || "Персонаж";
      const desc = dom.characterDescription.value.trim() || "без описания";
      
      setHelperBtnLoading(generateTraitsBtn, true);
      
      try {
        const prompt = `Сгенерируй 3-4 ключевые черты характера (Traits) на английском языке через запятую для персонажа "${charName}".
Описание персонажа: ${desc}.
Выбирай черты из списка: Cold, Shy, Expressive, Rude, Polite, Sarcastic, Caring, Proud, Cheerful, Stubborn, Mysterious, Loyal, Curious.
Выведи ТОЛЬКО список черт через запятую, без объяснений и кавычек. Например: Cold, Sarcastic, Proud`;

        const res = await sendMessageNonStream({
          apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: dom.characterModelSelect?.value || apiConfig.model,
          messages: [{ role: "user", content: prompt }], temperature: 0.7, maxTokens: 50
        });
        
        let cleanedRes = res.trim();
        cleanedRes = cleanedRes.replace(/^\s*```[a-z]*\n([\s\S]*?)\n```\s*$/i, '$1').trim();
        if (!cleanedRes) throw new Error("Модель вернула пустой ответ");
        
        dom.characterTraits.value = cleanedRes.replace(/^["']|["']$/g, "");
        if (traitsInput) traitsInput.dispatchEvent(new Event("input"));
      } catch (err) {
        alert(`Ошибка: ${err.message}`);
      } finally {
        setHelperBtnLoading(generateTraitsBtn, false);
      }
    });
  }

  if (generateAppBtn) {
    generateAppBtn.addEventListener("click", async () => {
      const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
      if (apiConfig.baseUrl === null && !apiConfig.apiKey) { alert("Укажите API-ключ OpenRouter в настройках."); return; }
      
      const charName = dom.characterName.value.trim() || "Персонаж";
      const desc = dom.characterDescription.value.trim() || "";
      const gender = dom.characterGender.value;
      
      setHelperBtnLoading(generateAppBtn, true);
      
      try {
        const prompt = `Опиши внешность персонажа для текстовой ролевой игры.
Имя: ${charName}
Концепция: ${desc}
Пол: ${gender === "he/him" ? "мужской" : gender === "she/her" ? "женский" : "небинарный"}.
Напиши краткое описание внешности (рост, телосложение, лицо, волосы, одежда, примечательные детали).
Ответь на русском языке. Объем: 2-3 предложения. Выведи ТОЛЬКО описание внешности без вводных фраз.`;

        const res = await sendMessageNonStream({
          apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: dom.characterModelSelect?.value || apiConfig.model,
          messages: [{ role: "user", content: prompt }], temperature: 0.8, maxTokens: 200
        });
        
        let cleanedRes = res.trim();
        cleanedRes = cleanedRes.replace(/^\s*```[a-z]*\n([\s\S]*?)\n```\s*$/i, '$1').trim();
        if (!cleanedRes) throw new Error("Модель вернула пустой ответ");
        
        dom.characterAppearance.value = cleanedRes;
      } catch (err) {
        alert(`Ошибка: ${err.message}`);
      } finally {
        setHelperBtnLoading(generateAppBtn, false);
      }
    });
  }

  if (generateBehavBtn) {
    generateBehavBtn.addEventListener("click", async () => {
      const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
      if (apiConfig.baseUrl === null && !apiConfig.apiKey) { alert("Укажите API-ключ OpenRouter в настройках."); return; }
      
      const charName = dom.characterName.value.trim() || "Персонаж";
      const desc = dom.characterDescription.value.trim() || "";
      const traits = dom.characterTraits.value.trim() || "";
      
      setHelperBtnLoading(generateBehavBtn, true);
      
      try {
        const prompt = `Опиши характер, поведение, повадки и привычки персонажа для ролевой игры.
Имя: ${charName}
Концепция: ${desc}
Черты характера: ${traits}
Опиши, как персонаж ведет себя в обществе, какие у него есть привычки, страхи или цели.
Ответь на русском языке. Объем: 2-3 предложения. Выведи ТОЛЬКО описание характера и поведения.`;

        const res = await sendMessageNonStream({
          apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: dom.characterModelSelect?.value || apiConfig.model,
          messages: [{ role: "user", content: prompt }], temperature: 0.8, maxTokens: 250
        });
        
        let cleanedRes = res.trim();
        cleanedRes = cleanedRes.replace(/^\s*```[a-z]*\n([\s\S]*?)\n```\s*$/i, '$1').trim();
        if (!cleanedRes) throw new Error("Модель вернула пустой ответ");
        
        dom.characterBehavior.value = cleanedRes;
      } catch (err) {
        alert(`Ошибка: ${err.message}`);
      } finally {
        setHelperBtnLoading(generateBehavBtn, false);
      }
    });
  }

  if (generateBackBtn) {
    generateBackBtn.addEventListener("click", async () => {
      const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
      if (apiConfig.baseUrl === null && !apiConfig.apiKey) { alert("Укажите API-ключ OpenRouter в настройках."); return; }
      
      const charName = dom.characterName.value.trim() || "Персонаж";
      const desc = dom.characterDescription.value.trim() || "";
      const behavior = dom.characterBehavior.value.trim() || "";
      const scenario = dom.characterScenario.value.trim() || "";
      
      setHelperBtnLoading(generateBackBtn, true);
      
      try {
        const prompt = `Напиши краткую предысторию (биографию) персонажа для ролевой игры.
Имя: ${charName}
Описание/Характер: ${desc} ${behavior}
Текущий сценарий игры: ${scenario}
Предыстория должна объяснять его прошлое, как он оказался в текущей ситуации, его мотивы или тайны.
Ответь на русском языке. Объем: 3-4 предложения. Выведи ТОЛЬКО предысторию.`;

        const res = await sendMessageNonStream({
          apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: dom.characterModelSelect?.value || apiConfig.model,
          messages: [{ role: "user", content: prompt }], temperature: 0.8, maxTokens: 300
        });
        
        let cleanedRes = res.trim();
        cleanedRes = cleanedRes.replace(/^\s*```[a-z]*\n([\s\S]*?)\n```\s*$/i, '$1').trim();
        if (!cleanedRes) throw new Error("Модель вернула пустой ответ");
        
        dom.characterBackstory.value = cleanedRes;
      } catch (err) {
        alert(`Ошибка: ${err.message}`);
      } finally {
        setHelperBtnLoading(generateBackBtn, false);
      }
    });
  }

  if (generateSpeechBtn) {
    generateSpeechBtn.addEventListener("click", async () => {
      const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
      if (apiConfig.baseUrl === null && !apiConfig.apiKey) {
        alert("Пожалуйста, вставьте API-ключ OpenRouter в настройках.");
        return;
      }
      
      const charName = dom.characterName.value.trim() || "Персонаж";
      const traits = dom.characterTraits.value.trim() || "без выраженных черт";
      
      setHelperBtnLoading(generateSpeechBtn, true);
      
      try {
        const prompt = `Мы создаем персонажа для ролевой игры по имени "${charName}" со следующими чертами характера: "${traits}".
Напиши краткое, но емкое руководство по его манере речи (Speech Style) для ИИ модели.
Например: говорит вежливо, использует старинные слова, обращается на 'вы', описывает свои жесты в звездочках.
Манера должна идеально подходить характеру.
Ответь кратко, 1-2 предложениями на русском языке. Выведи ТОЛЬКО описание манеры речи, без лишних вводных фраз и кавычек.`;

        const res = await sendMessageNonStream({
          apiKey: apiConfig.apiKey,
          baseUrl: apiConfig.baseUrl,
          model: dom.characterModelSelect?.value || apiConfig.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          maxTokens: 150
        });
        
        if (dom.characterSpeech) {
          dom.characterSpeech.value = res.trim();
        }
      } catch (err) {
        console.error("Failed to generate speech style:", err);
        alert(`Ошибка генерации: ${err.message}`);
      } finally {
        setHelperBtnLoading(generateSpeechBtn, false);
      }
    });
  }

  const generateImagePromptBtn = document.getElementById("generateImagePromptBtn");

  if (generateImagePromptBtn) {
    generateImagePromptBtn.addEventListener("click", async () => {
      const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
      if (apiConfig.baseUrl === null && !apiConfig.apiKey) { alert("Укажите API-ключ OpenRouter в настройках."); return; }
      
      const charName = dom.characterName.value.trim() || "Character";
      const gender = dom.characterGender.value || "female";
      const desc = dom.characterDescription.value.trim() || "";
      const appearance = dom.characterAppearance.value.trim() || "";
      const traits = dom.characterTraits.value.trim() || "";

      setHelperBtnLoading(generateImagePromptBtn, true);

      try {
        const prompt = `You are a professional AI image generation prompt engineer (Midjourney v6, Stable Diffusion XL, NovelAI, Flux).
Create a highly detailed, professional English image generation prompt for a character portrait/avatar.

Character Details:
- Name: ${charName}
- Gender/Pronouns: ${gender}
- Overview: ${desc}
- Appearance/Clothes/Features: ${appearance || "not specified, invent suitable anime/fantasy details"}
- Traits/Vibe: ${traits}

Rules for the output prompt:
1. Write EXCLUSIVELY in English.
2. Include subject, facial features, hair style & color, eye color, expressions, outfit, lighting, background atmosphere, art style (e.g. masterpiece, best quality, anime digital portrait / cinematic fantasy artwork, 8k resolution, detailed lighting).
3. Do NOT include intro or meta explanations like "Here is your prompt:". Output ONLY the raw english prompt text ready to copy-paste into Midjourney or Stable Diffusion.`;

        const targetModel = dom.characterModelSelect?.value || apiConfig.model || state.apiSettings.selectedModel || "google/gemini-2.5-flash";

        const res = await sendMessageNonStream({
          apiKey: apiConfig.apiKey,
          baseUrl: apiConfig.baseUrl,
          model: targetModel,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          maxTokens: 1000,
          enableThinking: false
        });

        let cleanedRes = (res || "").trim();
        // Remove <thought>...</thought> blocks if present
        cleanedRes = cleanedRes.replace(/<thought[\s\S]*?<\/thought>/gi, "").trim();
        cleanedRes = cleanedRes.replace(/^\s*```[a-z]*\n([\s\S]*?)\n```\s*$/i, '$1').trim();

        if (!cleanedRes) {
          // If thought stripping emptied the result, fallback to raw res
          cleanedRes = res.replace(/<\/?thought>/gi, "").trim();
        }

        if (!cleanedRes) throw new Error("Модель вернула пустой ответ. Попробуйте выбрать другую модель ИИ в настройках.");

        if (dom.characterImagePrompt) {
          dom.characterImagePrompt.value = cleanedRes;
        }
      } catch (err) {
        alert(`Ошибка генерации промпта для картинок: ${err.message}`);
      } finally {
        setHelperBtnLoading(generateImagePromptBtn, false);
      }
    });
  }

  if (generatePromptBtn) {
    generatePromptBtn.addEventListener("click", async () => {
      const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
      if (apiConfig.baseUrl === null && !apiConfig.apiKey) { alert("Укажите API-ключ OpenRouter в настройках."); return; }
      
      const charName = dom.characterName.value.trim() || "Персонаж";
      const traits = dom.characterTraits.value.trim() || "";
      const speech = dom.characterSpeech.value.trim() || "";
      
      setHelperBtnLoading(generatePromptBtn, true);
      
      try {
        const prompt = `Напиши список системных правил и инструкций (System Prompt) для ИИ модели, играющей роль персонажа "${charName}".
Его черты: "${traits}". Стиль общения: "${speech}".
Сформулируй инструкции по формату ответов. Например: пиши от 3-го лица, используй звездочки * для действий, мысли оформляй в теги <thought>...</thought>, никогда не отвечай за пользователя {{user}}, используй определенный лексикон.
Напиши список в виде 3-4 емких пунктов на английском или русском языке. Выведи ТОЛЬКО пункты инструкций без вступительного текста.`;

        const res = await sendMessageNonStream({
          apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: dom.characterModelSelect?.value || apiConfig.model,
          messages: [{ role: "user", content: prompt }], temperature: 0.7, maxTokens: 250
        });
        
        let cleanedRes = res.trim();
        cleanedRes = cleanedRes.replace(/^\s*```[a-z]*\n([\s\S]*?)\n```\s*$/i, '$1').trim();
        if (!cleanedRes) throw new Error("Модель вернула пустой ответ");
        
        dom.characterPrompt.value = cleanedRes;
      } catch (err) {
        alert(`Ошибка: ${err.message}`);
      } finally {
        setHelperBtnLoading(generatePromptBtn, false);
      }
    });
  }

  if (generateScenBtn) {
    generateScenBtn.addEventListener("click", async () => {
      const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
      if (apiConfig.baseUrl === null && !apiConfig.apiKey) { alert("Укажите API-ключ OpenRouter в настройках."); return; }
      
      const charName = dom.characterName.value.trim() || "Персонаж";
      const desc = dom.characterDescription.value.trim() || "";
      const behavior = dom.characterBehavior.value.trim() || "";
      
      setHelperBtnLoading(generateScenBtn, true);
      
      try {
        const prompt = `Напиши сценарий стартовой сцены (Scenario) для встречи пользователя {{user}} и персонажа {{char}} (по имени ${charName}).
Описание/Характер {{char}}: ${desc} ${behavior}
Опиши локацию, время суток, стартовую ситуацию и в каких отношениях они находятся на момент начала диалога. 
Используй макросы {{char}} и {{user}}.
КРИТИЧЕСКОЕ ПРАВИЛО: Пиши строго в третьем лице. НЕ используй прямую речь, диалоги или приветственные реплики персонажей. Это должно быть описание обстановки и начальных условий сцены (сценарий), а не первая реплика.
Пример правильного сценария: "{{user}} заходит в темную заброшенную библиотеку в полночь. За столом при свечах сидит {{char}} и читает книгу."
Ответь на русском языке. Объем: 2-3 предложения. Выведи ТОЛЬКО описание сценария.`;

        const res = await sendMessageNonStream({
          apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: dom.characterModelSelect?.value || apiConfig.model,
          messages: [{ role: "user", content: prompt }], temperature: 0.8, maxTokens: 250
        });
        
        let cleanedRes = res.trim();
        cleanedRes = cleanedRes.replace(/^\s*```[a-z]*\n([\s\S]*?)\n```\s*$/i, '$1').trim();
        if (!cleanedRes) throw new Error("Модель вернула пустой ответ");
        
        dom.characterScenario.value = cleanedRes;
      } catch (err) {
        alert(`Ошибка: ${err.message}`);
      } finally {
        setHelperBtnLoading(generateScenBtn, false);
      }
    });
  }

  if (generateFirstMsgBtn) {
    generateFirstMsgBtn.addEventListener("click", async () => {
      const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
      if (apiConfig.baseUrl === null && !apiConfig.apiKey) {
        alert("Пожалуйста, вставьте API-ключ OpenRouter в настройках.");
        return;
      }

      const charName = dom.characterName.value.trim() || "Персонаж";
      const traits = dom.characterTraits.value.trim() || "без выраженных черт";
      const desc = dom.characterDescription.value.trim() || "";
      const behavior = dom.characterBehavior.value.trim() || "";
      const scenario = dom.characterScenario.value.trim() || "";

      setHelperBtnLoading(generateFirstMsgBtn, true);

      try {
        const prompt = `Мы создаем персонажа для ролевой игры.
Имя: ${charName}
Краткое описание: ${desc}
Черты характера: ${traits}
Поведение: ${behavior}
Сценарий стартовой локации: ${scenario}

Напиши первое приветственное сообщение (First Message) от лица этого персонажа. 
Это должно быть атмосферное, кинематографичное введение в диалог. Описывай действия в звездочках *...*, пиши реплики персонажа в кавычках. 
Персонаж должен говорить строго в соответствии со своими чертами характера и сценарием.
Ответь на русском языке. Выведи ТОЛЬКО текст приветственного сообщения, без вводных фраз, пояснений и кавычек вокруг всего ответа.`;

        const res = await sendMessageNonStream({
          apiKey: apiConfig.apiKey,
          baseUrl: apiConfig.baseUrl,
          model: dom.characterModelSelect?.value || apiConfig.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.8,
          maxTokens: 400
        });

        if (dom.characterFirstMessage) {
          dom.characterFirstMessage.value = res.trim();
        }
      } catch (err) {
        console.error("Failed to generate first message:", err);
        alert(`Ошибка генерации: ${err.message}`);
      } finally {
        setHelperBtnLoading(generateFirstMsgBtn, false);
      }
    });
  }

  if (generateExBtn) {
    generateExBtn.addEventListener("click", async () => {
      const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
      if (apiConfig.baseUrl === null && !apiConfig.apiKey) { alert("Укажите API-ключ OpenRouter в настройках."); return; }
      
      const charName = dom.characterName.value.trim() || "Персонаж";
      const traits = dom.characterTraits.value.trim() || "";
      const speech = dom.characterSpeech.value.trim() || "";
      const behavior = dom.characterBehavior.value.trim() || "";
      
      setHelperBtnLoading(generateExBtn, true);
      
      try {
        const prompt = `Напиши примеры диалогов (Example Dialogs) для персонажа {{char}} (по имени ${charName}).
Его черты и стиль речи: ${traits}. ${speech}. ${behavior}.
Напиши ровно два коротких примера диалога, разделенных тегом <START>. Каждая реплика должна быть на новой строке.
Используй макросы {{user}} и {{char}}:. Описывай жесты/действия в звездочках *...*.
Пример формата:
<START>
{{user}}: "Привет! Чем ты занимаешься?"
{{char}}: *смотрит с подозрением* "Не твоё дело."
<START>
{{user}}: "Помоги мне с этим."
{{char}}: *вздыхает* "Ладно, давай сюда..."

Напиши диалоги на русском языке. Выведи ТОЛЬКО примеры диалога в указанном формате, без лишнего текста.`;

        const res = await sendMessageNonStream({
          apiKey: apiConfig.apiKey, baseUrl: apiConfig.baseUrl, model: dom.characterModelSelect?.value || apiConfig.model,
          messages: [{ role: "user", content: prompt }], temperature: 0.8, maxTokens: 400
        });
        
        let cleanedRes = res.trim();
        cleanedRes = cleanedRes.replace(/^\s*```[a-z]*\n([\s\S]*?)\n```\s*$/i, '$1').trim();
        if (!cleanedRes) throw new Error("Модель вернула пустой ответ");
        
        dom.characterExampleDialogs.value = cleanedRes;
      } catch (err) {
        alert(`Ошибка: ${err.message}`);
      } finally {
        setHelperBtnLoading(generateExBtn, false);
      }
    });
  }
}

export function parseGmMessage(content) {
  if (!content) return [];
  const regex = /\[CHARACTER:\s*([^\]\n]+)\]/gi;
  const rawBlocks = [];
  const matches = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      name: match[1].trim(),
    });
  }
  
  const activePersona = getActivePersona();
  const userName = activePersona ? (activePersona.userName || "User").toLowerCase() : "user";
  
  function shouldKeep(charName) {
    const nameLower = charName.toLowerCase();
    return nameLower !== "user" && nameLower !== "{{user}}" && nameLower !== "пользователь" && nameLower !== "игрок" && nameLower !== userName;
  }

  function cleanNarratorTag(text) {
    return text.replace(/^\[(?:NARRATOR|ВЕДУЩИЙ|РАССКАЗЧИК|ОКРУЖЕНИЕ|ХРОНИКА)\]\s*/i, "").trim();
  }

  if (matches.length === 0) {
    rawBlocks.push({ characterName: "Narrator", text: cleanNarratorTag(content) });
  } else {
    if (matches[0].index > 0) {
      const textBefore = cleanNarratorTag(content.substring(0, matches[0].index).trim());
      if (textBefore) {
        rawBlocks.push({
          characterName: "Narrator",
          text: textBefore
        });
      }
    }
    for (let i = 0; i < matches.length; i++) {
      const currentMatch = matches[i];
      const startIndex = currentMatch.index + currentMatch.length;
      const endIndex = (i + 1 < matches.length) ? matches[i + 1].index : content.length;
      const text = content.substring(startIndex, endIndex).trim();
      if (shouldKeep(currentMatch.name)) {
        rawBlocks.push({
          characterName: currentMatch.name,
          text: text
        });
      }
    }
  }

  // Smart Auto-Splitting: If the LLM omitted a [CHARACTER: Name] tag between speakers,
  // split paragraphs starting with known character names into their own character cards.
  const knownNames = Array.from(new Set([
    ...(state.characters || []).map(c => c.name?.trim()),
    ...rawBlocks.map(b => b.characterName?.trim()),
    ...(state.gmScenes || []).flatMap(s => (s.participants || []).map(p => p.name?.trim()))
  ].filter(name => name && name.toLowerCase() !== "narrator" && shouldKeep(name))));

  if (knownNames.length === 0) return rawBlocks;

  const finalBlocks = [];
  for (const block of rawBlocks) {
    if (!block.text || block.characterName.toLowerCase() === "narrator") {
      finalBlocks.push(block);
      continue;
    }

    const paragraphs = block.text.split(/(?:\r?\n)+/);
    if (paragraphs.length <= 1) {
      finalBlocks.push(block);
      continue;
    }

    let currentName = block.characterName;
    let currentParas = [];

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      let matchedSpeaker = null;
      for (const name of knownNames) {
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nameRegex = new RegExp(`^${escapedName}(?:[\\s,.:;!?—-]|\$)`, 'i');
        if (nameRegex.test(trimmed)) {
          matchedSpeaker = name;
          break;
        }
      }

      if (matchedSpeaker && matchedSpeaker.toLowerCase() !== currentName.toLowerCase()) {
        if (currentParas.length > 0) {
          finalBlocks.push({
            characterName: currentName,
            text: currentParas.join("\n\n")
          });
          currentParas = [];
        }
        currentName = matchedSpeaker;
      }
      currentParas.push(trimmed);
    }

    if (currentParas.length > 0) {
      finalBlocks.push({
        characterName: currentName,
        text: currentParas.join("\n\n")
      });
    }
  }

  return finalBlocks;
}

export function getAvatarStyleForName(name) {
  if (!name || !name.trim()) {
    name = "NPC";
  }
  const cleanName = name.trim();
  const isNarrator = ["narrator", "рассказчик", "ведущий", "мастер", "окружение", "хроника", "game master"].includes(cleanName.toLowerCase());
  if (isNarrator) {
    return {
      isNarrator: true,
      gradient: "linear-gradient(135deg, #3a3d40, #181a1b)",
      initials: "📜",
      headerColor: "var(--text-primary, #ffffff)",
      accentColor: "#ffffff",
      bubbleBg: "linear-gradient(135deg, rgba(20, 20, 24, 0.92) 0%, rgba(12, 12, 14, 0.90) 100%)",
      bubbleBorder: "rgba(255, 255, 255, 0.12)",
      fontStyle: "italic",
      textColor: "#e4e4e7"
    };
  }

  const foundChar = state.characters?.find(c => c.name && c.name.trim().toLowerCase() === cleanName.toLowerCase());
  let imageHtml = "";
  if (foundChar && foundChar.avatar) {
    imageHtml = `<img src="${escapeHtml(foundChar.avatar)}" alt="${escapeHtml(cleanName)}" class="gm-avatar-img" />`;
  }

  let hash = 0;
  for (let i = 0; i < cleanName.length; i++) {
    hash = cleanName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const zincGrades = [
    { g: "linear-gradient(135deg, #27272a 0%, #18181b 100%)", border: "rgba(255, 255, 255, 0.14)", header: "#ffffff" },
    { g: "linear-gradient(135deg, #3f3f46 0%, #27272a 100%)", border: "rgba(255, 255, 255, 0.16)", header: "#f4f4f5" },
    { g: "linear-gradient(135deg, #18181b 0%, #09090b 100%)", border: "rgba(255, 255, 255, 0.12)", header: "#e4e4e7" },
    { g: "linear-gradient(135deg, #323238 0%, #1c1c20 100%)", border: "rgba(255, 255, 255, 0.15)", header: "#ffffff" }
  ];
  const choice = zincGrades[Math.abs(hash) % zincGrades.length];

  return {
    isNarrator: false,
    gradient: choice.g,
    initials: cleanName.substring(0, 2).toUpperCase(),
    imageHtml,
    headerColor: choice.header,
    accentColor: "#ffffff",
    bubbleBg: "linear-gradient(135deg, rgba(20, 20, 24, 0.88) 0%, rgba(14, 14, 16, 0.88) 100%)",
    bubbleBorder: choice.border,
    fontStyle: "normal",
    textColor: "var(--text-primary)"
  };
}

export function createGmBlockElement(block) {
  const avatarStyle = getAvatarStyleForName(block.characterName);
  const blockDiv = document.createElement("div");

  if (avatarStyle.isNarrator) {
    blockDiv.className = "gm-narrator-card";
    blockDiv.innerHTML = `
      <div class="gm-narrator-header">
        <span class="gm-narrator-icon">📜</span>
        <span class="gm-narrator-title">ВЕДУЩИЙ / ХРОНИКА СОБЫТИЙ</span>
      </div>
      <div class="gm-narrator-text">
        ${formatMessageContent(block.text)}
      </div>
    `;
  } else {
    blockDiv.className = "gm-npc-card";
    blockDiv.style.setProperty("--npc-accent", avatarStyle.accentColor);
    const avatarContent = avatarStyle.imageHtml ? avatarStyle.imageHtml : avatarStyle.initials;

    blockDiv.innerHTML = `
      <div class="gm-npc-avatar" style="background: ${avatarStyle.gradient};">
        ${avatarContent}
      </div>
      <div class="gm-npc-body" style="background: ${avatarStyle.bubbleBg}; border-color: ${avatarStyle.bubbleBorder};">
        <div class="gm-npc-header">
          <span class="gm-npc-name" style="color: ${avatarStyle.headerColor};">${escapeHtml(block.characterName)}</span>
          <span class="gm-npc-badge">NPC</span>
        </div>
        <div class="gm-npc-text" style="color: ${avatarStyle.textColor}; font-style: ${avatarStyle.fontStyle};">
          ${formatMessageContent(block.text)}
        </div>
      </div>
    `;
  }
  return blockDiv;
}

export function renderTranslationBox(articleElement, translationText) {
  let box = articleElement.querySelector(".message-translation-box");
  if (!box) {
    box = document.createElement("div");
    box.className = "message-translation-box";
    const bodyEl = articleElement.querySelector(".message-body") || articleElement;
    bodyEl.appendChild(box);
  }
  box.style.display = "block";
  
  if (articleElement.classList.contains("gm-message") || translationText.includes("[CHARACTER:")) {
    const gmBlocks = parseGmMessage(translationText);
    if (gmBlocks.length > 0) {
      box.innerHTML = `
        <div class="translation-header">
          <span class="translation-label">🌐 Перевод (RU):</span>
        </div>
      `;
      gmBlocks.forEach(block => {
        box.appendChild(createGmBlockElement(block));
      });
      return;
    }
  }

  box.innerHTML = `
    <div class="translation-header">
      <span class="translation-label">🌐 Перевод (RU):</span>
    </div>
    <div class="translation-content">
      ${formatMessageContent(translationText)}
    </div>
  `;
}

export function createEvaluatorSpoilerElement(evaluatorData, actualIndex) {
  if (!evaluatorData) return null;

  const container = document.createElement("div");
  container.className = "message-evaluator-spoiler";
  if (actualIndex !== undefined) {
    container.dataset.msgIndex = String(actualIndex);
  }

  // 1. In-progress state
  if (evaluatorData.status === "in_progress") {
    container.classList.add("in-progress");
    container.innerHTML = `
      <div class="evaluator-spoiler-header">
        <div class="evaluator-header-left">
          <span class="evaluator-pulsing-icon">✨</span>
          <span class="evaluator-header-title">Анализ сцены и обновление памяти сюжета...</span>
          <span class="evaluator-pulsing-dot"></span>
        </div>
      </div>
    `;
    return container;
  }

  // 2. Completed state
  container.classList.add("collapsed");

  const header = document.createElement("div");
  header.className = "evaluator-spoiler-header";
  header.innerHTML = `
    <div class="evaluator-header-left">
      <span class="evaluator-icon">🧠</span>
      <span class="evaluator-header-title">Память сюжета обновлена</span>
      <span class="evaluator-preview-badge">клик для деталей</span>
    </div>
    <span class="evaluator-toggle-icon">▶</span>
  `;

  header.addEventListener("click", (e) => {
    e.stopPropagation();
    const isCollapsed = container.classList.toggle("collapsed");
    const icon = header.querySelector(".evaluator-toggle-icon");
    if (icon) {
      icon.textContent = isCollapsed ? "▶" : "▼";
    }
  });

  const content = document.createElement("div");
  content.className = "evaluator-spoiler-content";

  const inner = document.createElement("div");
  inner.className = "evaluator-body-inner";

  // Section 1: Текущая ситуация / Локация
  if (evaluatorData.location || evaluatorData.situation) {
    const sitSection = document.createElement("div");
    sitSection.className = "evaluator-section";
    
    let html = `<div class="evaluator-section-title">📍 Текущая ситуация и локация:</div>`;
    html += `<div class="evaluator-section-body">`;
    if (evaluatorData.location) {
      html += `<div class="evaluator-loc-row"><strong>Локация:</strong> <span>${escapeHtml(evaluatorData.location)}</span></div>`;
    }
    if (evaluatorData.situation) {
      html += `<div class="evaluator-sit-row"><strong>Обстановка:</strong> <span>${escapeHtml(evaluatorData.situation)}</span></div>`;
    }
    html += `</div>`;
    sitSection.innerHTML = html;
    inner.appendChild(sitSection);
  }

  // Section 2: Изменения стейтов персонажей
  if (Array.isArray(evaluatorData.stateChanges) && evaluatorData.stateChanges.length > 0) {
    const statesSection = document.createElement("div");
    statesSection.className = "evaluator-section";
    statesSection.innerHTML = `<div class="evaluator-section-title">📊 Изменения стейтов:</div>`;
    
    const statesList = document.createElement("div");
    statesList.className = "evaluator-states-list";

    evaluatorData.stateChanges.forEach(sc => {
      const item = document.createElement("div");
      const isPositive = typeof sc.diff === "number" && sc.diff > 0;
      const isNegative = typeof sc.diff === "number" && sc.diff < 0;
      item.className = `evaluator-state-item ${isPositive ? "positive" : isNegative ? "negative" : "neutral"}`;
      
      const diffSign = typeof sc.diff === "number" ? (sc.diff > 0 ? `+${sc.diff}` : `${sc.diff}`) : "";
      const diffBadge = diffSign ? `<span class="state-item-diff">${diffSign}</span>` : "";
      
      const valDisplay = (sc.oldVal !== null && sc.oldVal !== undefined)
        ? `<span class="state-item-val">${sc.oldVal} → ${sc.newVal}</span>`
        : `<span class="state-item-val">${sc.newVal}</span>`;

      item.innerHTML = `
        <span class="state-item-name">${escapeHtml(sc.name || sc.key)}:</span>
        ${valDisplay}
        ${diffBadge}
      `;
      statesList.appendChild(item);
    });

    statesSection.appendChild(statesList);
    inner.appendChild(statesSection);
  }

  // Section 3: Краткая заметка в кодекс
  if (evaluatorData.codexNote) {
    const noteSection = document.createElement("div");
    noteSection.className = "evaluator-section";
    noteSection.innerHTML = `
      <div class="evaluator-section-title">📖 Заметка в Кодекс:</div>
      <div class="evaluator-section-body evaluator-codex-note">
        ${escapeHtml(evaluatorData.codexNote)}
      </div>
    `;
    inner.appendChild(noteSection);
  }

  // Section 4: Кнопка-ссылка [Открыть полный Кодекс]
  const footerRow = document.createElement("div");
  footerRow.className = "evaluator-footer-row";
  const openCodexBtn = document.createElement("button");
  openCodexBtn.type = "button";
  openCodexBtn.className = "evaluator-open-codex-btn";
  openCodexBtn.innerHTML = `<span>🧠 Открыть полный Кодекс</span> <svg class="feather" viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
  openCodexBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (dom.openSessionCodexBtn) {
      dom.openSessionCodexBtn.click();
    } else if (typeof window.openSummaryModal === "function") {
      window.openSummaryModal("structured");
    }
  });
  footerRow.appendChild(openCodexBtn);
  inner.appendChild(footerRow);

  content.appendChild(inner);
  container.appendChild(header);
  container.appendChild(content);

  return container;
}

export function openImageViewer(imgUrl) {
  if (dom.imageViewerModal && dom.imageViewerImg) {
    dom.imageViewerImg.src = imgUrl;
    dom.imageViewerModal.showModal();
  }
}

let isAddingDirectiveInline = false;
let addingDirectiveWithHardPriority = false;
let editingDirectiveInlineId = null;

export function renderDirectivesBar() {
  if (!dom.directivesBar) return;
  const isGm = state.sidebarTab === "gm";
  const activeId = isGm ? state.activeGmSceneId : state.activeCharacterId;
  if (!activeId) {
    dom.directivesBar.style.display = "none";
    dom.directivesBar.innerHTML = "";
    return;
  }
  const activeChatId = getActiveChatId(activeId);
  const directives = (state.characterDirectives || {})[activeChatId] || [];

  dom.directivesBar.style.display = "flex";
  dom.directivesBar.innerHTML = "";

  directives.forEach((dir) => {
    if (editingDirectiveInlineId === dir.id) {
      const wrap = document.createElement("div");
      wrap.className = "directive-inline-input-wrap";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "directive-inline-input";
      input.value = dir.text;
      input.placeholder = "Введите идею персонажа...";

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "directive-inline-btn";
      saveBtn.textContent = "Сохранить";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "directive-inline-btn cancel";
      cancelBtn.textContent = "✕";

      const doSave = () => {
        const val = input.value.trim();
        if (val) {
          dir.text = val;
          saveCharacterDirectives(state.characterDirectives);
        }
        editingDirectiveInlineId = null;
        renderDirectivesBar();
      };

      saveBtn.addEventListener("click", doSave);
      cancelBtn.addEventListener("click", () => {
        editingDirectiveInlineId = null;
        renderDirectivesBar();
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); doSave(); }
        if (e.key === "Escape") { editingDirectiveInlineId = null; renderDirectivesBar(); }
      });

      wrap.appendChild(input);
      wrap.appendChild(saveBtn);
      wrap.appendChild(cancelBtn);
      dom.directivesBar.appendChild(wrap);
      setTimeout(() => input.focus(), 50);
      return;
    }

    const isHard = dir.priority === "hard";
    const isCompleted = dir.completed === true;
    const mode = dir.mode || "auto";

    const chip = document.createElement("div");
    chip.className = `directive-chip ${dir.active === false ? "disabled" : ""} ${isHard ? "hard-priority" : ""} ${isCompleted ? "completed" : ""}`;

    const textSpan = document.createElement("span");
    textSpan.className = "directive-chip-text";
    if (isCompleted) {
      const compBadge = document.createElement("span");
      compBadge.className = "directive-completed-badge";
      compBadge.textContent = "✨ ";
      compBadge.title = "Цель выполнена!";
      textSpan.appendChild(compBadge);
    }
    if (isHard) {
      const badge = document.createElement("span");
      badge.className = "directive-hard-badge";
      badge.textContent = "🔥 ";
      badge.title = "Жёсткий приоритет (модель активно продавливает эту идею)";
      textSpan.appendChild(badge);
    }
    textSpan.appendChild(document.createTextNode(dir.text));
    textSpan.title = `${dir.text} (${isHard ? "ЖЁСТКИЙ приоритет! " : ""}${isCompleted ? "✨ ВЫПОЛНЕНО! " : ""}кликните, чтобы вкл/выкл, 2 клика для редактирования)`;
    textSpan.addEventListener("click", () => {
      toggleDirectiveActive(activeChatId, dir.id);
    });
    textSpan.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      editingDirectiveInlineId = dir.id;
      isAddingDirectiveInline = false;
      renderDirectivesBar();
    });

    const actions = document.createElement("div");
    actions.className = "directive-chip-actions";

    const modeBtn = document.createElement("button");
    modeBtn.type = "button";
    modeBtn.className = "directive-action-btn directive-mode-btn";
    modeBtn.innerHTML = mode === "auto" ? "🎯" : (mode === "once" ? "⚡" : "♾️");
    modeBtn.title = mode === "auto"
      ? "🎯 Режим: Авто-отключение (модель сама выключит идею, когда достигнет цели). Кликните для смены."
      : (mode === "once"
        ? "⚡ Режим: Разовая (отключится после 1 ответа). Кликните для смены."
        : "♾️ Режим: Постоянная (не отключать автоматически). Кликните для смены.");
    modeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleDirectiveMode(activeChatId, dir.id);
    });

    const priorityBtn = document.createElement("button");
    priorityBtn.type = "button";
    priorityBtn.className = `directive-action-btn priority-btn ${isHard ? "active" : ""}`;
    priorityBtn.innerHTML = isHard ? "🔥" : "⚡";
    priorityBtn.title = isHard
      ? "Жёсткий приоритет включён (нажмите, чтобы сделать обычным)"
      : "Обычный приоритет (нажмите, чтобы включить ЖЁСТКИЙ приоритет — модель будет агрессивно продавливать идею)";
    priorityBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleDirectivePriority(activeChatId, dir.id);
    });

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "directive-action-btn";
    toggleBtn.innerHTML = dir.active === false ? "❌" : "✅";
    toggleBtn.title = dir.active === false ? "Включить идею" : "Выключить идею";
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleDirectiveActive(activeChatId, dir.id);
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "directive-action-btn";
    editBtn.innerHTML = "✏️";
    editBtn.title = "Редактировать идею";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      editingDirectiveInlineId = dir.id;
      isAddingDirectiveInline = false;
      renderDirectivesBar();
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "directive-action-btn delete";
    delBtn.innerHTML = "🗑️";
    delBtn.title = "Удалить идею";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteDirective(activeChatId, dir.id);
    });

    actions.appendChild(modeBtn);
    actions.appendChild(priorityBtn);
    actions.appendChild(toggleBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    chip.appendChild(textSpan);
    chip.appendChild(actions);
    dom.directivesBar.appendChild(chip);
  });

  if (isAddingDirectiveInline) {
    const wrap = document.createElement("div");
    wrap.className = "directive-inline-input-wrap";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "directive-inline-input";
    input.placeholder = "Идея персонажа (нажмите Enter)...";

    const priorityToggleBtn = document.createElement("button");
    priorityToggleBtn.type = "button";
    priorityToggleBtn.className = `directive-inline-btn priority-toggle ${addingDirectiveWithHardPriority ? "active" : ""}`;
    priorityToggleBtn.innerHTML = addingDirectiveWithHardPriority ? "🔥 Жёстко" : "⚡ Обычная";
    priorityToggleBtn.title = "Переключить приоритет создаваемой идеи";
    priorityToggleBtn.addEventListener("click", () => {
      addingDirectiveWithHardPriority = !addingDirectiveWithHardPriority;
      priorityToggleBtn.className = `directive-inline-btn priority-toggle ${addingDirectiveWithHardPriority ? "active" : ""}`;
      priorityToggleBtn.innerHTML = addingDirectiveWithHardPriority ? "🔥 Жёстко" : "⚡ Обычная";
    });

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "directive-inline-btn";
    saveBtn.textContent = "Добавить";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "directive-inline-btn cancel";
    cancelBtn.textContent = "✕";

    const doAdd = () => {
      const val = input.value.trim();
      if (val) {
        if (!state.characterDirectives) state.characterDirectives = {};
        const list = state.characterDirectives[activeChatId] || [];
        list.push({
          id: "dir_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
          text: val,
          active: true,
          priority: addingDirectiveWithHardPriority ? "hard" : "normal",
          mode: "auto",
          completed: false
        });
        state.characterDirectives[activeChatId] = list;
        saveCharacterDirectives(state.characterDirectives);
      }
      isAddingDirectiveInline = false;
      addingDirectiveWithHardPriority = false;
      renderDirectivesBar();
    };

    saveBtn.addEventListener("click", doAdd);
    cancelBtn.addEventListener("click", () => {
      isAddingDirectiveInline = false;
      addingDirectiveWithHardPriority = false;
      renderDirectivesBar();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); doAdd(); }
      if (e.key === "Escape") { isAddingDirectiveInline = false; addingDirectiveWithHardPriority = false; renderDirectivesBar(); }
    });

    wrap.appendChild(input);
    wrap.appendChild(priorityToggleBtn);
    wrap.appendChild(saveBtn);
    wrap.appendChild(cancelBtn);
    dom.directivesBar.appendChild(wrap);
    setTimeout(() => input.focus(), 50);
  } else {
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn-add-directive";
    addBtn.innerHTML = `💡 <span>+ Идея</span>`;
    addBtn.title = "Внедрить идею или установку персонажу";
    addBtn.addEventListener("click", () => {
      isAddingDirectiveInline = true;
      addingDirectiveWithHardPriority = false;
      editingDirectiveInlineId = null;
      renderDirectivesBar();
    });
    dom.directivesBar.appendChild(addBtn);
  }
}

export function toggleDirectiveActive(chatId, directiveId) {
  if (!state.characterDirectives) state.characterDirectives = {};
  const list = state.characterDirectives[chatId] || [];
  const target = list.find(d => d.id === directiveId);
  if (target) {
    target.active = target.active === false ? true : false;
    if (target.active) {
      target.completed = false;
    }
    saveCharacterDirectives(state.characterDirectives);
    renderDirectivesBar();
  }
}

export function toggleDirectivePriority(chatId, directiveId) {
  if (!state.characterDirectives) state.characterDirectives = {};
  const list = state.characterDirectives[chatId] || [];
  const target = list.find(d => d.id === directiveId);
  if (target) {
    target.priority = target.priority === "hard" ? "normal" : "hard";
    saveCharacterDirectives(state.characterDirectives);
    renderDirectivesBar();
  }
}

export function toggleDirectiveMode(chatId, directiveId) {
  if (!state.characterDirectives) state.characterDirectives = {};
  const list = state.characterDirectives[chatId] || [];
  const target = list.find(d => d.id === directiveId);
  if (target) {
    const current = target.mode || "auto";
    if (current === "auto") target.mode = "once";
    else if (current === "once") target.mode = "keep";
    else target.mode = "auto";

    saveCharacterDirectives(state.characterDirectives);
    renderDirectivesBar();

    const modeLabels = {
      auto: "🎯 Авто-отключение при достижении цели",
      once: "⚡ Разовая (отключится после 1 ответа)",
      keep: "♾️ Постоянная (пока не отключите сами)"
    };
    showStateNotification(`Режим идеи: ${modeLabels[target.mode]}`);
  }
}

export function deleteDirective(chatId, directiveId) {
  if (!state.characterDirectives) state.characterDirectives = {};
  let list = state.characterDirectives[chatId] || [];
  state.characterDirectives[chatId] = list.filter(d => d.id !== directiveId);
  saveCharacterDirectives(state.characterDirectives);
  renderDirectivesBar();
}

/**
 * Checks if the assistant response reached the goal of any active directive.
 * Automatically marks completed directives as inactive and strips completion tags.
 */
export function checkAndCompleteDirectives(chatId, content) {
  if (!content || !state.characterDirectives || !state.characterDirectives[chatId]) {
    return { cleanContent: content || "", completedDirectives: [] };
  }

  const list = state.characterDirectives[chatId] || [];
  const activeList = list.filter(d => d.active !== false);
  if (activeList.length === 0) {
    return { cleanContent: content, completedDirectives: [] };
  }

  const completedDirectives = [];
  const goalRegex = /(?:<!--\s*(?:GOAL_REACHED|DONE_DIRECTIVE|DIRECTIVE_COMPLETED|IDEA_DONE):\s*([^>]+?)\s*-->|\[\s*(?:ВЫПОЛНЕНО|DONE|COMPLETED|GOAL_REACHED):\s*([^\]]+?)\s*\])/gi;

  let cleanContent = content;
  let match;
  while ((match = goalRegex.exec(content)) !== null) {
    const rawVal = (match[1] || match[2] || "").trim();
    const items = rawVal.split(/[,;\s]+/);
    for (const item of items) {
      if (!item) continue;
      const num = parseInt(item, 10);
      let target = null;
      if (!isNaN(num) && num >= 1 && num <= activeList.length) {
        target = activeList[num - 1];
      } else {
        target = activeList.find(d => d.id === item || d.id.includes(item) || d.text.toLowerCase().includes(item.toLowerCase()));
      }
      if (target && target.mode !== "keep" && !completedDirectives.includes(target)) {
        completedDirectives.push(target);
      }
    }
  }

  // Also auto-complete 1-shot directives (mode === "once")
  activeList.forEach(d => {
    if (d.mode === "once" && !completedDirectives.includes(d)) {
      completedDirectives.push(d);
    }
  });

  // Strip completion tags from the visible message
  cleanContent = cleanContent.replace(goalRegex, "").trim();

  if (completedDirectives.length > 0) {
    completedDirectives.forEach(d => {
      d.active = false;
      d.completed = true;
    });
    saveCharacterDirectives(state.characterDirectives);
    renderDirectivesBar();
  }

  return { cleanContent, completedDirectives };
}

/* ═══════════════════════════════════════════════════════════════════════════
   ── AI Character Studio 2.0 UI Handlers ──
   ═══════════════════════════════════════════════════════════════════════════ */

export function updateStudioLivePreview() {
  const name = dom.studioNameInput?.value.trim() || "Имя персонажа";
  const desc = dom.studioDescriptionInput?.value.trim() || "Краткое описание появится здесь";
  const traits = (dom.studioTraitsInput?.value || "")
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);
  const firstMsg = dom.studioFirstMessageInput?.value.trim() || "";

  if (dom.studioPreviewName) dom.studioPreviewName.textContent = name;
  if (dom.studioPreviewDesc) dom.studioPreviewDesc.textContent = desc;
  if (dom.studioPreviewSpeaker) dom.studioPreviewSpeaker.textContent = name.toUpperCase();

  if (dom.studioAvatarPreview) {
    const avatarStyle = getAvatarStyleForName(name);
    dom.studioAvatarPreview.style.background = avatarStyle.gradient;
    dom.studioAvatarPreview.textContent = avatarStyle.initials;
  }

  if (dom.studioPreviewTraits) {
    dom.studioPreviewTraits.innerHTML = "";
    traits.slice(0, 4).forEach(t => {
      const pill = document.createElement("span");
      pill.className = "live-trait-pill";
      pill.textContent = t;
      dom.studioPreviewTraits.appendChild(pill);
    });
  }

  if (dom.studioPreviewDialogue) {
    if (firstMsg) {
      dom.studioPreviewDialogue.innerHTML = formatMessageContent(firstMsg);
    } else {
      dom.studioPreviewDialogue.innerHTML = `<em>Напишите идею или выберите готовый архетип, затем нажмите «Создать за 1 клик»...</em>`;
    }
  }
}

export function initStudioUI() {
  // Live input sync
  const studioInputs = [
    dom.studioNameInput,
    dom.studioGenderSelect,
    dom.studioDescriptionInput,
    dom.studioTraitsInput,
    dom.studioAppearanceInput,
    dom.studioBehaviorInput,
    dom.studioSpeechInput,
    dom.studioScenarioInput,
    dom.studioFirstMessageInput
  ];

  studioInputs.forEach(input => {
    if (input && typeof input.addEventListener === "function") {
      input.addEventListener("input", updateStudioLivePreview);
      input.addEventListener("change", updateStudioLivePreview);
    }
  });

  // Random Concept Generator Button
  if (dom.studioRandomBtn) {
    dom.studioRandomBtn.addEventListener("click", async () => {
      const { getRandomConcept } = await import("./wizards.js");
      if (dom.studioConceptInput) {
        dom.studioConceptInput.value = getRandomConcept();
        dom.studioConceptInput.focus();
      }
    });
  }

  // 1-Click Generate Button
  if (dom.studioGenerateBtn) {
    dom.studioGenerateBtn.addEventListener("click", async () => {
      const { handleWizardInput } = await import("./wizards.js");
      await handleWizardInput();
    });
  }

  // Enter key on concept input
  if (dom.studioConceptInput) {
    dom.studioConceptInput.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const { handleWizardInput } = await import("./wizards.js");
        await handleWizardInput();
      }
    });
  }

  // Archetype Presets Chips
  document.querySelectorAll(".archetype-chip").forEach(chip => {
    chip.addEventListener("click", async () => {
      const concept = chip.dataset.concept;
      if (dom.studioConceptInput) {
        dom.studioConceptInput.value = concept;
      }
      const { handleWizardInput } = await import("./wizards.js");
      await handleWizardInput();
    });
  });

  // Trait Badges Toggle
  document.querySelectorAll(".studio-trait-tag:not(.hidden-trait-tag)").forEach(tag => {
    tag.addEventListener("click", () => {
      const trait = tag.dataset.trait;
      let currentTraits = (dom.studioTraitsInput?.value || "")
        .split(",")
        .map(t => t.trim())
        .filter(Boolean);
      const lowerTraits = currentTraits.map(t => t.toLowerCase());
      const lowerTarget = trait.toLowerCase();
      if (lowerTraits.includes(lowerTarget)) {
        currentTraits = currentTraits.filter(t => t.toLowerCase() !== lowerTarget);
      } else {
        currentTraits.push(trait);
      }
      if (dom.studioTraitsInput) {
        dom.studioTraitsInput.value = currentTraits.join(", ");
      }
      
      document.querySelectorAll(".studio-trait-tag:not(.hidden-trait-tag)").forEach(t => {
        const tVal = (t.dataset.trait || "").toLowerCase();
        t.classList.toggle("active", currentTraits.map(x => x.toLowerCase()).includes(tVal));
      });
      updateStudioLivePreview();
    });
  });

  // Hidden Trait Badges Toggle
  document.querySelectorAll(".studio-trait-tag.hidden-trait-tag").forEach(tag => {
    tag.addEventListener("click", () => {
      const trait = tag.dataset.trait;
      let currentTraits = (dom.studioHiddenTraitsInput?.value || "")
        .split(",")
        .map(t => t.trim())
        .filter(Boolean);
      const lowerTraits = currentTraits.map(t => t.toLowerCase());
      const lowerTarget = trait.toLowerCase();
      if (lowerTraits.includes(lowerTarget)) {
        currentTraits = currentTraits.filter(t => t.toLowerCase() !== lowerTarget);
      } else {
        currentTraits.push(trait);
      }
      if (dom.studioHiddenTraitsInput) {
        dom.studioHiddenTraitsInput.value = currentTraits.join(", ");
      }
      
      document.querySelectorAll(".studio-trait-tag.hidden-trait-tag").forEach(t => {
        const tVal = (t.dataset.trait || "").toLowerCase();
        t.classList.toggle("active", currentTraits.map(x => x.toLowerCase()).includes(tVal));
      });
    });
  });

  // Smart Modifier Chips
  document.querySelectorAll(".smart-chip[data-modify]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const modifyType = btn.dataset.modify;
      btn.disabled = true;
      const oldText = btn.textContent;
      btn.textContent = "⏳...";
      try {
        const { applySmartModifier, collectStudioData } = await import("./wizards.js");
        const currentData = collectStudioData();
        const res = await applySmartModifier(modifyType, currentData);
        if (res.behavior && dom.studioBehaviorInput) dom.studioBehaviorInput.value = res.behavior;
        if (res.speech && dom.studioSpeechInput) dom.studioSpeechInput.value = res.speech;
        if (res.firstMessage && dom.studioFirstMessageInput) dom.studioFirstMessageInput.value = res.firstMessage;
        updateStudioLivePreview();
        showStateNotification("Характеристики персонажа обновлены!");
      } catch (err) {
        showStateNotification(`Ошибка: ${err.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = oldText;
      }
    });
  });

  // 3-Variant Greeting Generator
  if (dom.studioGenerateGreetingVariantsBtn) {
    dom.studioGenerateGreetingVariantsBtn.addEventListener("click", async () => {
      const btn = dom.studioGenerateGreetingVariantsBtn;
      btn.disabled = true;
      btn.textContent = "⏳ Генерирую...";
      try {
        const { generateGreetingVariants, collectStudioData } = await import("./wizards.js");
        const charData = collectStudioData();
        const variants = await generateGreetingVariants(charData);
        state.studioGreetingVariants = variants;
        if (dom.greetingVariantsTabs) dom.greetingVariantsTabs.style.display = "flex";
        if (variants[0] && dom.studioFirstMessageInput) dom.studioFirstMessageInput.value = variants[0];
        
        const tabBtns = document.querySelectorAll(".variant-tab-btn");
        tabBtns.forEach((b, idx) => {
          b.classList.toggle("active", idx === 0);
        });
        updateStudioLivePreview();
        showStateNotification("3 варианта приветствия готовы!");
      } catch (err) {
        showStateNotification(`Ошибка: ${err.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = "🎲 3 варианта приветствия";
      }
    });
  }

  // Greeting Variants Tabs
  document.querySelectorAll(".variant-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const varIdx = parseInt(btn.dataset.var, 10);
      if (state.studioGreetingVariants && state.studioGreetingVariants[varIdx]) {
        if (dom.studioFirstMessageInput) dom.studioFirstMessageInput.value = state.studioGreetingVariants[varIdx];
        document.querySelectorAll(".variant-tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        updateStudioLivePreview();
      }
    });
  });

  // Save and Chat Button
  if (dom.studioSaveAndChatBtn) {
    dom.studioSaveAndChatBtn.addEventListener("click", async () => {
      const { finalizeStudioCharacter, collectStudioData } = await import("./wizards.js");
      const charData = collectStudioData();
      finalizeStudioCharacter(charData, true, (newId) => {
        if (selectCharacterCallback) selectCharacterCallback(newId);
      });
    });
  }

  // Open in Full Detailed Editor Button
  if (dom.studioOpenFullEditorBtn) {
    dom.studioOpenFullEditorBtn.addEventListener("click", async () => {
      const { collectStudioData } = await import("./wizards.js");
      const data = collectStudioData();
      
      if (dom.characterName) dom.characterName.value = data.name;
      if (dom.characterGender) dom.characterGender.value = data.gender;
      if (dom.characterDescription) dom.characterDescription.value = data.description;
      if (dom.characterTraits) dom.characterTraits.value = (data.traits || []).join(", ");
      if (dom.characterAppearance) dom.characterAppearance.value = data.appearance;
      if (dom.characterBehavior) dom.characterBehavior.value = data.behavior;
      if (dom.characterSpeech) dom.characterSpeech.value = data.speech;
      if (dom.characterScenario) dom.characterScenario.value = data.scenario;
      if (dom.characterFirstMessage) dom.characterFirstMessage.value = data.firstMessage;
      
      if (dom.adminWizardView) dom.adminWizardView.style.display = "none";
      if (dom.characterForm) dom.characterForm.style.display = "flex";
    });
  }
}

// Initialize features when DOM is ready
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initCharacterFormFeatures();
      initStudioUI();
    });
  } else {
    initCharacterFormFeatures();
    initStudioUI();
  }
}
