function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseKey(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const SESSION_STORAGE_KEY = "ferienwohnung_session_v1";
const ACCOUNTS_STORAGE_KEY = "ferienwohnung_accounts_v1";
const CHECKLIST_STORAGE_KEY = "ferienwohnung_departure_checklist_v1";
const CHECKLIST_SESSION_STATE_KEY = "ferienwohnung_departure_checklist_session_v1";
const STAYS_STORAGE_KEY = "ferienwohnung_stays_v1";
const STAYS_MIGRATION_KEY = "ferienwohnung_stays_migration_v2";
const DEFAULT_FAMILY_ACCOUNTS = [
  { username: "christiane", password: "christiane123", displayName: "Christiane", isAdmin: true },
  { username: "kai", password: "kai123", displayName: "Kai", isAdmin: true },
  { username: "dirk", password: "dirk123", displayName: "Dirk", isAdmin: true },
  { username: "peer", password: "peer123", displayName: "Peer", isAdmin: true },
  { username: "till", password: "till123", displayName: "Till", isAdmin: true },
  { username: "merle", password: "merle123", displayName: "Merle", isAdmin: false },
  { username: "berit", password: "berit123", displayName: "Berit", isAdmin: false },
  { username: "kerstin", password: "kerstin123", displayName: "Kerstin", isAdmin: false },
  { username: "frieda", password: "frieda123", displayName: "Frieda", isAdmin: false },
  { username: "matthis", password: "matthis123", displayName: "Matthis", isAdmin: false },
  { username: "georg", password: "georg123", displayName: "Georg", isAdmin: false },
  { username: "katrin", password: "katrin123", displayName: "Katrin", isAdmin: false },
  { username: "elsa", password: "elsa123", displayName: "Elsa", isAdmin: false },
  { username: "anna", password: "anna123", displayName: "Anna", isAdmin: false },
  { username: "nele", password: "nele123", displayName: "Nele", isAdmin: false },
  { username: "paula", password: "paula123", displayName: "Paula", isAdmin: false }
];

function isSuperAdminUsername(username) {
  return normalizeUsername(username) === "till";
}

function normalizeUsername(value) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function sanitizeAccount(account) {
  const generatedId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  return {
    id: typeof account.id === "string" ? account.id : generatedId,
    username: normalizeUsername(account.username || ""),
    password: String(account.password || ""),
    displayName: String(account.displayName || "").trim(),
    isAdmin: Boolean(account.isAdmin),
    isSuperAdmin: isSuperAdminUsername(account.username || "")
  };
}

function ensureAccountsSeeded() {
  const requiredUsernames = new Set(DEFAULT_FAMILY_ACCOUNTS.map((account) => account.username));
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const existingUsernames = new Set(parsed.map((entry) => normalizeUsername(entry.username || "")));
        const allRequiredPresent = [...requiredUsernames].every((username) => existingUsernames.has(username));
        if (allRequiredPresent) {
          return;
        }
      }
    }
  } catch {
    // Ignore parse errors and seed defaults.
  }

  const seeded = DEFAULT_FAMILY_ACCOUNTS.map((account) => ({
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    ...account
  }));
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(seeded));
}

function loadAccounts() {
  ensureAccountsSeeded();
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(sanitizeAccount).filter((account) => account.username && account.displayName && account.password);
  } catch {
    return [];
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts.map(sanitizeAccount)));
}

function getCurrentPageName() {
  const path = window.location.pathname;
  const fileName = path.split("/").pop();
  return fileName || "index.html";
}

function getCurrentSession() {
  const accounts = loadAccounts();
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.username !== "string" || typeof parsed.displayName !== "string") {
      return null;
    }
    const account = accounts.find((entry) => entry.username === normalizeUsername(parsed.username));
    if (!account) {
      return null;
    }
    return {
      username: account.username,
      displayName: account.displayName,
      isAdmin: Boolean(account.isAdmin),
      isSuperAdmin: Boolean(account.isSuperAdmin)
    };
  } catch {
    return null;
  }
}

function setCurrentSession(account) {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      username: account.username,
      displayName: account.displayName,
      isAdmin: Boolean(account.isAdmin),
      isSuperAdmin: Boolean(account.isSuperAdmin)
    })
  );
}

function clearCurrentSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  sessionStorage.removeItem(CHECKLIST_SESSION_STATE_KEY);
}

function loadChecklistItems() {
  const defaults = [
    "Geschirr gespült und eingeräumt",
    "Müll entsorgt",
    "Fenster geschlossen",
    "Heizung heruntergedreht",
    "Licht ausgeschaltet",
    "Schlüssel im Safe hinterlegt"
  ];

  try {
    const raw = localStorage.getItem(CHECKLIST_STORAGE_KEY);
    if (!raw) {
      const seeded = defaults.map((text, index) => ({ id: `default-${index + 1}`, text }));
      localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const seeded = defaults.map((text, index) => ({ id: `default-${index + 1}`, text }));
      localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return parsed.filter((item) => item && typeof item.id === "string" && typeof item.text === "string" && item.text.trim());
  } catch {
    const seeded = defaults.map((text, index) => ({ id: `default-${index + 1}`, text }));
    localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

function saveChecklistItems(items) {
  localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(items));
}

function loadChecklistSessionState() {
  try {
    const raw = sessionStorage.getItem(CHECKLIST_SESSION_STATE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function saveChecklistSessionState(state) {
  sessionStorage.setItem(CHECKLIST_SESSION_STATE_KEY, JSON.stringify(state));
}

function createStayId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function loadStaysData() {
  // One-time reset to remove legacy stay entries from earlier calendar versions.
  if (localStorage.getItem(STAYS_MIGRATION_KEY) !== "done") {
    localStorage.removeItem(STAYS_STORAGE_KEY);
    localStorage.setItem(STAYS_MIGRATION_KEY, "done");
  }

  try {
    const raw = localStorage.getItem(STAYS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item) => {
        return item && typeof item.id === "string" && typeof item.title === "string" && typeof item.startDate === "string" &&
          typeof item.endDate === "string" && (item.status === "tentative" || item.status === "fixed") &&
          typeof item.creatorUsername === "string" && typeof item.creatorName === "string";
      })
      .map((item) => ({
        ...item,
        description: typeof item.description === "string" ? item.description : "",
        participants: {
          users: Array.isArray(item.participants && item.participants.users) ? item.participants.users.filter((u) => typeof u === "string") : [],
          guests: Array.isArray(item.participants && item.participants.guests) ? item.participants.guests.filter((g) => typeof g === "string") : []
        },
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date(0).toISOString(),
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : (typeof item.createdAt === "string" ? item.createdAt : new Date(0).toISOString())
      }));
  } catch {
    return [];
  }
}

function saveStaysData(stays) {
  localStorage.setItem(STAYS_STORAGE_KEY, JSON.stringify(stays));
}

function initAuthRouting() {
  const page = getCurrentPageName();
  const session = getCurrentSession();
  const isLoginPage = page === "login.html";

  if (isLoginPage && session) {
    window.location.href = "index.html";
    return { shouldInitLogin: false, shouldInitApp: false, session: null };
  }

  if (!isLoginPage && !session) {
    window.location.href = "login.html";
    return { shouldInitLogin: false, shouldInitApp: false, session: null };
  }

  if (page === "accounts.html" && session && !session.isAdmin) {
    window.location.href = "index.html";
    return { shouldInitLogin: false, shouldInitApp: false, session: null };
  }

  return {
    shouldInitLogin: isLoginPage,
    shouldInitApp: !isLoginPage,
    session
  };
}

function initLoginPage() {
  const loginForm = document.getElementById("loginForm");
  const loginUsername = document.getElementById("loginUsername");
  const loginPassword = document.getElementById("loginPassword");
  const loginError = document.getElementById("loginError");

  if (!loginForm || !loginUsername || !loginPassword || !loginError) {
    return;
  }

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = loginUsername.value.trim().toLowerCase();
    const password = loginPassword.value;

    const account = loadAccounts().find((entry) => entry.username === username && entry.password === password);

    if (!account) {
      loginError.classList.remove("hidden");
      return;
    }

    setCurrentSession(account);
    window.location.href = "index.html";
  });
}

function initTopbarAccount() {
  const session = getCurrentSession();
  if (!session) {
    return;
  }

  const badge = document.getElementById("currentUserBadge");
  const logoutBtn = document.getElementById("logoutBtn");

  if (badge) {
    const roleLabel = session.isSuperAdmin ? "Superadmin" : session.isAdmin ? "Admin" : "Familienkonto";
    badge.textContent = `${session.displayName} | ${roleLabel}`;
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      clearCurrentSession();
      window.location.href = "login.html";
    });
  }
}

const NEWS_STORAGE_KEY = "ferienwohnung_news_v1";

function createNewsId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function loadNewsItems() {
  try {
    const raw = localStorage.getItem(NEWS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item) => item && typeof item.id === "string" && typeof item.author === "string" && typeof item.message === "string")
      .map((item) => ({
        ...item,
        priority: item.priority === "important" ? "important" : "normal",
        pinned: Boolean(item.pinned),
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date(0).toISOString()
      }));
  } catch {
    return [];
  }
}

function saveNewsItems(newsItems) {
  localStorage.setItem(NEWS_STORAGE_KEY, JSON.stringify(newsItems));
}

function sortNewsItems(newsItems) {
  return newsItems.slice().sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    if (a.priority !== b.priority) {
      return a.priority === "important" ? -1 : 1;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function renderNewsList(newsList, newsItems, options = { allowActions: false, onEdit: null, onDelete: null }) {
  const dateFormatter = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });
  newsList.innerHTML = "";
  const sorted = sortNewsItems(newsItems);

  if (sorted.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "Noch keine News vorhanden.";
    newsList.appendChild(empty);
    return;
  }

  sorted.forEach((item) => {
    const li = document.createElement("li");
    li.className = "news-item";
    if (item.priority === "important") {
      li.classList.add("important");
    }

    const head = document.createElement("div");
    head.className = "news-item-head";

    const author = document.createElement("p");
    author.className = "news-author";
    author.textContent = item.author;

    const date = document.createElement("p");
    date.className = "news-date";
    date.textContent = dateFormatter.format(new Date(item.createdAt));

    head.appendChild(author);
    head.appendChild(date);

    const message = document.createElement("p");
    message.className = "news-message";
    message.textContent = item.message;

    li.appendChild(head);
    const badges = document.createElement("div");
    badges.className = "news-badges";
    if (item.priority === "important") {
      const importantBadge = document.createElement("span");
      importantBadge.className = "news-badge important";
      importantBadge.textContent = "Wichtig";
      badges.appendChild(importantBadge);
    }
    if (item.pinned) {
      const pinnedBadge = document.createElement("span");
      pinnedBadge.className = "news-badge pinned";
      pinnedBadge.textContent = "Angepinnt";
      badges.appendChild(pinnedBadge);
    }
    if (badges.childElementCount > 0) {
      li.appendChild(badges);
    }
    li.appendChild(message);

    if (options.allowActions) {
      const actions = document.createElement("div");
      actions.className = "incident-actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "mini-btn soft";
      editBtn.textContent = "Bearbeiten";
      editBtn.addEventListener("click", () => options.onEdit(item.id));

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "mini-btn warn";
      deleteBtn.textContent = "Löschen";
      deleteBtn.addEventListener("click", () => options.onDelete(item.id));

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      li.appendChild(actions);
    }

    newsList.appendChild(li);
  });
}

function initHomeNewsPage() {
  const homeNewsList = document.getElementById("homeNewsList");
  const adminAccountsLink = document.getElementById("adminAccountsLink");
  if (!homeNewsList) {
    return;
  }
  const session = getCurrentSession();
  if (adminAccountsLink && session && session.isAdmin) {
    adminAccountsLink.classList.remove("hidden");
  }
  renderNewsList(homeNewsList, loadNewsItems());
}

function initNewsManagerPage() {
  const newsForm = document.getElementById("newsForm");
  const newsAuthorFixed = document.getElementById("newsAuthorFixed");
  const newsMessageInput = document.getElementById("newsMessage");
  const newsPriorityInput = document.getElementById("newsPriority");
  const newsPinnedInput = document.getElementById("newsPinned");
  const newsManagerList = document.getElementById("newsManagerList");
  const newsSubmitBtn = document.getElementById("newsSubmitBtn");
  const newsFormTitle = document.getElementById("newsFormTitle");
  const newsCancelEditBtn = document.getElementById("newsCancelEditBtn");

  if (
    !newsForm ||
    !newsAuthorFixed ||
    !newsMessageInput ||
    !newsPriorityInput ||
    !newsPinnedInput ||
    !newsManagerList ||
    !newsSubmitBtn ||
    !newsFormTitle ||
    !newsCancelEditBtn
  ) {
    return;
  }

  const session = getCurrentSession();
  const canManageNews = Boolean(session && session.isAdmin);
  const authorName = session ? session.displayName : "";
  let newsItems = loadNewsItems();
  let editingNewsId = null;

  newsAuthorFixed.textContent = `Autor: ${authorName}`;

  if (!canManageNews) {
    newsForm.classList.add("hidden");
    const note = document.createElement("p");
    note.className = "permission-note";
    note.textContent = "Dein Account darf News lesen, aber nicht erstellen oder bearbeiten.";
    newsForm.parentElement.insertBefore(note, newsManagerList);
    renderNewsList(newsManagerList, newsItems);
    return;
  }

  function resetNewsForm() {
    editingNewsId = null;
    newsForm.reset();
    newsFormTitle.textContent = "Neuen Hinweis erstellen";
    newsSubmitBtn.textContent = "Kommentar speichern";
    newsCancelEditBtn.classList.add("hidden");
    newsPriorityInput.value = "normal";
    newsPinnedInput.checked = false;
  }

  function startEditingNews(id) {
    const item = newsItems.find((entry) => entry.id === id);
    if (!item) {
      return;
    }
    editingNewsId = id;
    newsMessageInput.value = item.message;
    newsPriorityInput.value = item.priority === "important" ? "important" : "normal";
    newsPinnedInput.checked = Boolean(item.pinned);
    newsFormTitle.textContent = "Hinweis bearbeiten";
    newsSubmitBtn.textContent = "Änderung speichern";
    newsCancelEditBtn.classList.remove("hidden");
  }

  function removeNewsItem(id) {
    newsItems = newsItems.filter((item) => item.id !== id);
    if (editingNewsId === id) {
      resetNewsForm();
    }
    saveNewsItems(newsItems);
    renderNewsList(newsManagerList, newsItems, {
      allowActions: true,
      onEdit: startEditingNews,
      onDelete: removeNewsItem
    });
  }

  newsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const author = authorName;
    const message = newsMessageInput.value.trim();
    const priority = newsPriorityInput.value === "important" ? "important" : "normal";
    const pinned = newsPinnedInput.checked;
    if (!author || !message) {
      return;
    }

    if (editingNewsId) {
      newsItems = newsItems.map((item) => {
        if (item.id !== editingNewsId) {
          return item;
        }
        return {
          ...item,
          author,
          message,
          priority,
          pinned
        };
      });
    } else {
      newsItems.unshift({
        id: createNewsId(),
        author,
        message,
        priority,
        pinned,
        createdAt: new Date().toISOString()
      });
    }

    saveNewsItems(newsItems);
    renderNewsList(newsManagerList, newsItems, {
      allowActions: true,
      onEdit: startEditingNews,
      onDelete: removeNewsItem
    });
    resetNewsForm();
  });

  newsCancelEditBtn.addEventListener("click", () => {
    resetNewsForm();
  });

  resetNewsForm();
  renderNewsList(newsManagerList, newsItems, {
    allowActions: true,
    onEdit: startEditingNews,
    onDelete: removeNewsItem
  });
}

function initAccountsPage() {
  const accountForm = document.getElementById("accountForm");
  const accountDisplayNameInput = document.getElementById("accountDisplayName");
  const accountUsernameInput = document.getElementById("accountUsername");
  const accountPasswordInput = document.getElementById("accountPassword");
  const accountIsAdminInput = document.getElementById("accountIsAdmin");
  const accountsList = document.getElementById("accountsList");

  if (!accountForm || !accountDisplayNameInput || !accountUsernameInput || !accountPasswordInput || !accountIsAdminInput || !accountsList) {
    return;
  }

  let accounts = loadAccounts();
  const session = getCurrentSession();
  const currentUsername = session ? session.username : "";
  const isSuperAdmin = Boolean(session && session.isSuperAdmin);

  if (!isSuperAdmin) {
    accountIsAdminInput.checked = false;
    accountIsAdminInput.disabled = true;
  }

  function refreshSessionFromAccounts() {
    const refreshed = accounts.find((entry) => entry.username === currentUsername);
    if (refreshed) {
      setCurrentSession(refreshed);
    }
  }

  function canChangePassword(targetAccount) {
    if (!session) {
      return false;
    }
    if (session.isSuperAdmin) {
      return true;
    }
    if (!session.isAdmin) {
      return targetAccount.username === currentUsername;
    }
    if (targetAccount.username === currentUsername) {
      return true;
    }
    return !targetAccount.isAdmin;
  }

  function canToggleAdminRole(targetAccount) {
    if (!session || !session.isSuperAdmin) {
      return false;
    }
    if (targetAccount.isSuperAdmin) {
      return false;
    }
    return true;
  }

  function canDeleteAccount(targetAccount) {
    if (!session) {
      return false;
    }
    if (targetAccount.username === currentUsername || targetAccount.isSuperAdmin) {
      return false;
    }
    if (session.isSuperAdmin) {
      return true;
    }
    if (session.isAdmin) {
      return !targetAccount.isAdmin;
    }
    return false;
  }

  function renderAccounts() {
    accountsList.innerHTML = "";
    const sorted = accounts.slice().sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));

    sorted.forEach((account) => {
      const li = document.createElement("li");
      li.className = "account-item";

      const head = document.createElement("div");
      head.className = "account-head";

      const name = document.createElement("p");
      name.className = "account-name";
      name.textContent = account.displayName;

      const role = document.createElement("span");
      if (account.isSuperAdmin) {
        role.className = "account-badge super";
        role.textContent = "Superadmin";
      } else {
        role.className = `account-badge ${account.isAdmin ? "admin" : "member"}`;
        role.textContent = account.isAdmin ? "Admin" : "Mitglied";
      }

      head.appendChild(name);
      head.appendChild(role);

      const meta = document.createElement("p");
      meta.className = "account-meta";
      meta.textContent = `Benutzername: ${account.username}`;

      const actions = document.createElement("div");
      actions.className = "incident-actions";

      const passwordBtn = document.createElement("button");
      passwordBtn.type = "button";
      passwordBtn.className = "mini-btn primary";
      passwordBtn.textContent = "Passwort ändern";
      const passwordAllowed = canChangePassword(account);
      if (!passwordAllowed) {
        passwordBtn.disabled = true;
        passwordBtn.title = "Keine Berechtigung";
      }
      passwordBtn.addEventListener("click", () => {
        if (!canChangePassword(account)) {
          return;
        }
        const newPassword = window.prompt(`Neues Passwort für ${account.displayName}:`, "");
        if (!newPassword) {
          return;
        }
        if (newPassword.trim().length < 4) {
          return;
        }
        accounts = accounts.map((entry) => {
          if (entry.id !== account.id) {
            return entry;
          }
          return { ...entry, password: newPassword.trim() };
        });
        saveAccounts(accounts);
        refreshSessionFromAccounts();
        renderAccounts();
      });

      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "mini-btn soft";
      toggleBtn.textContent = account.isAdmin ? "Admin entziehen" : "Zu Admin machen";
      if (!canToggleAdminRole(account)) {
        toggleBtn.disabled = true;
        toggleBtn.title = "Nur Superadmin darf Adminrechte vergeben/entziehen";
      }
      toggleBtn.addEventListener("click", () => {
        if (!canToggleAdminRole(account)) {
          return;
        }
        const adminCount = accounts.filter((entry) => entry.isAdmin).length;
        if (account.isAdmin && adminCount <= 1) {
          return;
        }
        accounts = accounts.map((entry) => {
          if (entry.id !== account.id) {
            return entry;
          }
          return { ...entry, isAdmin: !entry.isAdmin, isSuperAdmin: entry.isSuperAdmin };
        });
        saveAccounts(accounts);
        refreshSessionFromAccounts();
        renderAccounts();
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "mini-btn warn";
      deleteBtn.textContent = "Löschen";
      if (!canDeleteAccount(account)) {
        deleteBtn.disabled = true;
        deleteBtn.title = "Keine Berechtigung";
      }
      deleteBtn.addEventListener("click", () => {
        if (!canDeleteAccount(account)) {
          return;
        }
        const adminCount = accounts.filter((entry) => entry.isAdmin).length;
        if (account.isAdmin && adminCount <= 1) {
          return;
        }
        accounts = accounts.filter((entry) => entry.id !== account.id);
        saveAccounts(accounts);
        renderAccounts();
      });

      actions.appendChild(passwordBtn);
      actions.appendChild(toggleBtn);
      actions.appendChild(deleteBtn);

      li.appendChild(head);
      li.appendChild(meta);
      li.appendChild(actions);
      accountsList.appendChild(li);
    });
  }

  accountForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const displayName = accountDisplayNameInput.value.trim().replace(/\s+/g, " ");
    const username = normalizeUsername(accountUsernameInput.value);
    const password = accountPasswordInput.value.trim();
    const isAdmin = isSuperAdmin ? accountIsAdminInput.checked : false;

    if (!displayName || !username || !password) {
      return;
    }
    if (accounts.some((entry) => entry.username === username)) {
      return;
    }

    accounts.unshift({
      id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      displayName,
      username,
      password,
      isAdmin,
      isSuperAdmin: isSuperAdminUsername(username)
    });

    saveAccounts(accounts);
    accountForm.reset();
    renderAccounts();
  });

  renderAccounts();
}

function initChecklistPage() {
  const checklistList = document.getElementById("checklistList");
  const checklistForm = document.getElementById("checklistForm");
  const checklistNewItem = document.getElementById("checklistNewItem");
  const checklistAdminHint = document.getElementById("checklistAdminHint");

  if (!checklistList || !checklistForm || !checklistNewItem || !checklistAdminHint) {
    return;
  }

  const session = getCurrentSession();
  const canEdit = Boolean(session && session.isAdmin);
  let items = loadChecklistItems();
  let checkedState = loadChecklistSessionState();

  if (canEdit) {
    checklistForm.classList.remove("hidden");
    checklistAdminHint.classList.add("hidden");
  } else {
    checklistForm.classList.add("hidden");
    checklistAdminHint.classList.remove("hidden");
  }

  function renderChecklist() {
    checklistList.innerHTML = "";
    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "checklist-item";

      const line = document.createElement("label");
      line.className = "checkline";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(checkedState[item.id]);

      const text = document.createElement("p");
      text.textContent = item.text;
      if (checkbox.checked) {
        text.classList.add("done");
      }

      checkbox.addEventListener("change", () => {
        checkedState[item.id] = checkbox.checked;
        saveChecklistSessionState(checkedState);
        if (checkbox.checked) {
          text.classList.add("done");
        } else {
          text.classList.remove("done");
        }
      });

      line.appendChild(checkbox);
      line.appendChild(text);
      li.appendChild(line);

      if (canEdit) {
        const actions = document.createElement("div");
        actions.className = "incident-actions";

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "mini-btn soft";
        editBtn.textContent = "Bearbeiten";
        editBtn.addEventListener("click", () => {
          const nextText = window.prompt("Checklist-Punkt bearbeiten:", item.text);
          if (!nextText || !nextText.trim()) {
            return;
          }
          items = items.map((entry) => (entry.id === item.id ? { ...entry, text: nextText.trim() } : entry));
          saveChecklistItems(items);
          renderChecklist();
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "mini-btn warn";
        deleteBtn.textContent = "Löschen";
        deleteBtn.addEventListener("click", () => {
          items = items.filter((entry) => entry.id !== item.id);
          delete checkedState[item.id];
          saveChecklistItems(items);
          saveChecklistSessionState(checkedState);
          renderChecklist();
        });

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        li.appendChild(actions);
      }

      checklistList.appendChild(li);
    });

    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-hint";
      empty.textContent = "Noch keine Punkte in der Abreise-Checklist.";
      checklistList.appendChild(empty);
    }
  }

  checklistForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!canEdit) {
      return;
    }
    const text = checklistNewItem.value.trim();
    if (!text) {
      return;
    }
    const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    items.push({ id, text });
    saveChecklistItems(items);
    checklistForm.reset();
    renderChecklist();
  });

  renderChecklist();
}

function initCalendarPage() {
  const weekdayRow = document.getElementById("weekdayRow");
  const calendarGrid = document.getElementById("calendarGrid");
  const monthLabel = document.getElementById("monthLabel");
  const selectedDate = document.getElementById("selectedDate");
  const selectedStatus = document.getElementById("selectedStatus");
  const selectedStaysList = document.getElementById("selectedStaysList");
  const prevMonthBtn = document.getElementById("prevMonth");
  const nextMonthBtn = document.getElementById("nextMonth");
  const todayBtn = document.getElementById("todayBtn");

  if (!weekdayRow || !calendarGrid || !monthLabel || !selectedDate || !selectedStatus || !selectedStaysList) {
    return;
  }

  const session = getCurrentSession();
  if (!session) {
    return;
  }

  const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const monthFormatter = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });
  const longDateFormatter = new Intl.DateTimeFormat("de-DE", { dateStyle: "full" });

  const today = startOfDay(new Date());
  let currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  let selectedKey = null;
  let stays = loadStaysData();
  const accounts = loadAccounts();

  function canEditStay(stay) {
    return Boolean(session && (session.isAdmin || stay.creatorUsername === session.username));
  }

  function statusLabel(status) {
    return status === "fixed" ? "Fest geplant" : "Vormerken";
  }

  function dateStays(key) {
    return stays.filter((stay) => stay.startDate <= key && stay.endDate >= key);
  }

  function dayState(key) {
    const found = dateStays(key);
    if (found.length === 0) {
      return { status: "available", label: "Frei", owner: "" };
    }
    const sorted = found.slice().sort((a, b) => {
      const aCreated = typeof a.createdAt === "string" ? a.createdAt : "";
      const bCreated = typeof b.createdAt === "string" ? b.createdAt : "";
      return bCreated.localeCompare(aCreated);
    });
    const fixedStay = sorted.find((stay) => stay.status === "fixed");
    const primary = fixedStay || sorted[0];
    return {
      status: primary.status,
      label: primary.status === "fixed" ? "Fest" : "Vormerk",
      owner: primary.creatorName
    };
  }

  function editStay(stayId) {
    window.location.href = `stay.html?edit=${encodeURIComponent(stayId)}`;
  }

  function participantsText(stay) {
    const userNames = ((stay.participants && stay.participants.users) || [])
      .map((username) => accounts.find((entry) => entry.username === username))
      .filter(Boolean)
      .map((account) => account.displayName);
    const guests = (stay.participants && stay.participants.guests) || [];
    const all = [...userNames, ...guests];
    return all.length > 0 ? all.join(", ") : "Keine Teilnehmer hinterlegt";
  }

  function renderSelectedDayDetails() {
    if (!selectedKey) {
      selectedDate.textContent = "Kein Datum ausgewählt.";
      selectedStatus.textContent = "Klicke auf einen Kalendertag.";
      selectedStaysList.innerHTML = "";
      return;
    }

    const dateObj = parseKey(selectedKey);
    selectedDate.textContent = longDateFormatter.format(dateObj);
    const found = dateStays(selectedKey).sort((a, b) => a.startDate.localeCompare(b.startDate));

    if (found.length === 0) {
      selectedStatus.textContent = "Frei - Kein Aufenthalt geplant.";
      selectedStaysList.innerHTML = "";
      const empty = document.createElement("p");
      empty.className = "empty-hint";
      empty.textContent = "An diesem Tag ist aktuell kein Aufenthalt eingetragen.";
      selectedStaysList.appendChild(empty);
      return;
    }

    selectedStatus.textContent = `${found.length} Aufenthalt(e) eingetragen`;
    selectedStaysList.innerHTML = "";

    found.forEach((stay) => {
      const li = document.createElement("li");
      li.className = "stay-item";

      const head = document.createElement("div");
      head.className = "news-item-head";
      const title = document.createElement("p");
      title.className = "news-author";
      title.textContent = stay.title;
      const badge = document.createElement("span");
      badge.className = `news-badge ${stay.status === "fixed" ? "important" : "pinned"}`;
      badge.textContent = statusLabel(stay.status);
      head.appendChild(title);
      head.appendChild(badge);

      const meta = document.createElement("p");
      meta.className = "news-message";
      meta.textContent = `${stay.startDate} bis ${stay.endDate} | Ersteller: ${stay.creatorName}`;

      const participants = document.createElement("p");
      participants.className = "news-message";
      participants.textContent = `Teilnehmer: ${participantsText(stay)}`;

      li.appendChild(head);
      li.appendChild(meta);
      li.appendChild(participants);

      if (stay.description) {
        const description = document.createElement("p");
        description.className = "news-message";
        description.textContent = stay.description;
        li.appendChild(description);
      }

      if (canEditStay(stay)) {
        const actions = document.createElement("div");
        actions.className = "incident-actions";
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "mini-btn soft";
        editBtn.textContent = "Eintrag anpassen";
        editBtn.addEventListener("click", () => editStay(stay.id));
        actions.appendChild(editBtn);
        li.appendChild(actions);
      }

      selectedStaysList.appendChild(li);
    });
  }

  function renderWeekdays() {
    weekdayRow.innerHTML = "";
    weekdays.forEach((day) => {
      const el = document.createElement("div");
      el.textContent = day;
      weekdayRow.appendChild(el);
    });
  }

  function renderCalendar() {
    calendarGrid.innerHTML = "";
    monthLabel.textContent = monthFormatter.format(currentMonth);
    monthLabel.textContent = monthLabel.textContent.charAt(0).toUpperCase() + monthLabel.textContent.slice(1);

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = (firstOfMonth.getDay() + 6) % 7;

    for (let i = 0; i < firstWeekday; i += 1) {
      const placeholder = document.createElement("div");
      placeholder.className = "placeholder";
      calendarGrid.appendChild(placeholder);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const key = toKey(date);
      const state = dayState(key);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `day ${state.status}`;
      btn.dataset.key = key;

      if (key === toKey(today)) {
        btn.classList.add("today");
      }
      if (key === selectedKey) {
        btn.classList.add("selected");
      }

      const num = document.createElement("div");
      num.className = "day-number";
      num.textContent = String(day);

      const badge = document.createElement("span");
      badge.className = "state";
      badge.textContent = state.label;

      const owner = document.createElement("small");
      owner.className = "owner";
      owner.textContent = state.owner || "";

      btn.appendChild(num);
      btn.appendChild(badge);
      if (state.owner) {
        btn.appendChild(owner);
      }

      btn.addEventListener("click", () => {
        selectedKey = key;
        renderSelectedDayDetails();
        renderCalendar();
      });

      calendarGrid.appendChild(btn);
    }
  }


  if (prevMonthBtn) {
    prevMonthBtn.addEventListener("click", () => {
      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
      renderCalendar();
    });
  }

  if (nextMonthBtn) {
    nextMonthBtn.addEventListener("click", () => {
      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
      renderCalendar();
    });
  }

  if (todayBtn) {
    todayBtn.addEventListener("click", () => {
      currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      selectedKey = toKey(today);
      renderSelectedDayDetails();
      renderCalendar();
    });
  }
  renderWeekdays();
  selectedKey = toKey(today);
  renderSelectedDayDetails();
  renderCalendar();
}

function initStayPlannerPage() {
  const stayForm = document.getElementById("stayForm");
  const stayTitle = document.getElementById("stayTitle");
  const stayStartDate = document.getElementById("stayStartDate");
  const stayEndDate = document.getElementById("stayEndDate");
  const stayStatus = document.getElementById("stayStatus");
  const stayDescription = document.getElementById("stayDescription");
  const stayParticipantsUsers = document.getElementById("stayParticipantsUsers");
  const stayGuestName = document.getElementById("stayGuestName");
  const addGuestBtn = document.getElementById("addGuestBtn");
  const stayGuestsList = document.getElementById("stayGuestsList");
  const saveStayBtn = document.getElementById("saveStayBtn");
  const cancelStayEditBtn = document.getElementById("cancelStayEditBtn");
  const deleteStayBtn = document.getElementById("deleteStayBtn");
  const stayCreatorHint = document.getElementById("stayCreatorHint");
  const stayFormMessage = document.getElementById("stayFormMessage");

  if (
    !stayForm || !stayTitle || !stayStartDate || !stayEndDate || !stayStatus || !stayDescription || !stayParticipantsUsers ||
    !stayGuestName || !addGuestBtn || !stayGuestsList || !saveStayBtn || !cancelStayEditBtn || !deleteStayBtn || !stayCreatorHint || !stayFormMessage
  ) {
    return;
  }

  const session = getCurrentSession();
  if (!session) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const initialEditStayId = params.get("edit");
  let editingStayId = initialEditStayId;
  let draftGuests = [];
  let stays = loadStaysData();
  const accounts = loadAccounts();

  function canEditStay(stay) {
    return Boolean(session && (session.isAdmin || stay.creatorUsername === session.username));
  }

  function renderUserParticipants() {
    stayParticipantsUsers.innerHTML = "";
    accounts
      .slice()
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"))
      .forEach((account) => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = account.username;
        const text = document.createElement("span");
        text.textContent = account.displayName;
        label.appendChild(checkbox);
        label.appendChild(text);
        stayParticipantsUsers.appendChild(label);
      });
  }

  function renderDraftGuests() {
    stayGuestsList.innerHTML = "";
    draftGuests.forEach((guest, index) => {
      const li = document.createElement("li");
      li.className = "news-item";
      const head = document.createElement("div");
      head.className = "news-item-head";
      const name = document.createElement("p");
      name.className = "news-author";
      name.textContent = guest;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mini-btn warn";
      remove.textContent = "Entfernen";
      remove.addEventListener("click", () => {
        draftGuests = draftGuests.filter((_, guestIndex) => guestIndex !== index);
        renderDraftGuests();
      });
      head.appendChild(name);
      head.appendChild(remove);
      li.appendChild(head);
      stayGuestsList.appendChild(li);
    });
  }

  function getSelectedParticipantUsernames() {
    const checked = [];
    stayParticipantsUsers.querySelectorAll("input[type='checkbox']").forEach((box) => {
      if (box.checked) {
        checked.push(box.value);
      }
    });
    return checked;
  }

  function setSelectedParticipantUsernames(usernames) {
    const selected = new Set(usernames || []);
    stayParticipantsUsers.querySelectorAll("input[type='checkbox']").forEach((box) => {
      box.checked = selected.has(box.value);
    });
  }

  function resetStayForm() {
    editingStayId = null;
    stayForm.reset();
    stayStatus.value = "tentative";
    stayStartDate.value = toKey(new Date());
    stayEndDate.value = toKey(new Date());
    draftGuests = [];
    setSelectedParticipantUsernames([]);
    renderDraftGuests();
    saveStayBtn.textContent = "Aufenthalt speichern";
    cancelStayEditBtn.classList.add("hidden");
    deleteStayBtn.classList.add("hidden");
    stayCreatorHint.textContent = `Ersteller: ${session.displayName}`;
    stayFormMessage.textContent = "";
  }

  function loadEditStay(stayId) {
    const stay = stays.find((entry) => entry.id === stayId);
    if (!stay || !canEditStay(stay)) {
      resetStayForm();
      return;
    }

    editingStayId = stay.id;
    stayTitle.value = stay.title;
    stayStartDate.value = stay.startDate;
    stayEndDate.value = stay.endDate;
    stayStatus.value = stay.status;
    stayDescription.value = stay.description || "";
    setSelectedParticipantUsernames((stay.participants && stay.participants.users) || []);
    draftGuests = ((stay.participants && stay.participants.guests) || []).slice();
    renderDraftGuests();
    saveStayBtn.textContent = "Änderung speichern";
    cancelStayEditBtn.classList.remove("hidden");
    if (canEditStay(stay)) {
      deleteStayBtn.classList.remove("hidden");
    } else {
      deleteStayBtn.classList.add("hidden");
    }
    stayCreatorHint.textContent = `Ersteller: ${stay.creatorName}`;
    stayFormMessage.textContent = "";
  }

  function rangesOverlap(startA, endA, startB, endB) {
    return startA <= endB && startB <= endA;
  }

  function findConflictingFixedStay(startDate, endDate, ignoreStayId) {
    return stays.find((stay) => {
      if (stay.id === ignoreStayId) {
        return false;
      }
      if (stay.status !== "fixed") {
        return false;
      }
      return rangesOverlap(startDate, endDate, stay.startDate, stay.endDate);
    }) || null;
  }

  function saveStay(event) {
    event.preventDefault();
    stayFormMessage.textContent = "";
    const title = stayTitle.value.trim();
    const startDate = stayStartDate.value;
    const endDate = stayEndDate.value;
    const status = stayStatus.value;
    const description = stayDescription.value.trim();
    const users = getSelectedParticipantUsernames();

    if (!title || !startDate || !endDate || startDate > endDate) {
      stayFormMessage.textContent = "Bitte prüfe Titel sowie Start- und Enddatum.";
      return;
    }

    const conflict = findConflictingFixedStay(startDate, endDate, editingStayId);
    if (conflict) {
      stayFormMessage.textContent = `Konflikt: Überschneidung mit "${conflict.title}" (${conflict.startDate} bis ${conflict.endDate}, Ersteller: ${conflict.creatorName}).`;
      return;
    }

    const payload = {
      title,
      startDate,
      endDate,
      status: status === "fixed" ? "fixed" : "tentative",
      description,
      participants: {
        users,
        guests: draftGuests.slice()
      }
    };

    if (editingStayId) {
      stays = stays.map((stay) => {
        if (stay.id !== editingStayId) {
          return stay;
        }
        if (!canEditStay(stay)) {
          return stay;
        }
        return {
          ...stay,
          ...payload,
          updatedAt: new Date().toISOString()
        };
      });
    } else {
      stays.unshift({
        id: createStayId(),
        ...payload,
        creatorUsername: session.username,
        creatorName: session.displayName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    saveStaysData(stays);
    window.location.href = "index.html";
  }

  stayForm.addEventListener("submit", saveStay);

  addGuestBtn.addEventListener("click", () => {
    const name = stayGuestName.value.trim().replace(/\s+/g, " ");
    if (!name) {
      return;
    }
    draftGuests.push(name);
    stayGuestName.value = "";
    renderDraftGuests();
  });

  cancelStayEditBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  deleteStayBtn.addEventListener("click", () => {
    if (!editingStayId) {
      return;
    }
    const stay = stays.find((entry) => entry.id === editingStayId);
    if (!stay || !canEditStay(stay)) {
      return;
    }
    stays = stays.filter((entry) => entry.id !== editingStayId);
    saveStaysData(stays);
    window.location.href = "index.html";
  });

  renderUserParticipants();
  resetStayForm();
  if (initialEditStayId) {
    loadEditStay(initialEditStayId);
  }
}

function initTasksPage() {
  const taskForm = document.getElementById("taskForm");
  const taskTitleInput = document.getElementById("taskTitle");
  const taskDueDateInput = document.getElementById("taskDueDate");
  const taskList = document.getElementById("taskList");
  const taskSummary = document.getElementById("taskSummary");

  if (!taskForm || !taskTitleInput || !taskDueDateInput || !taskList || !taskSummary) {
    return;
  }

  const shortDateFormatter = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });
  const TASK_STORAGE_KEY = "ferienwohnung_tasks_v1";
  const session = getCurrentSession();
  let tasks = loadTasks();

  function createTaskId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  }

  function loadTasks() {
    try {
      const raw = localStorage.getItem(TASK_STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((task) => task && typeof task.id === "string" && typeof task.title === "string")
        .map((task) => ({ ...task, status: task.status === "done" ? "done" : "todo" }));
    } catch {
      return [];
    }
  }

  function saveTasks() {
    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
  }

  function updateTaskSummary() {
    const openCount = tasks.filter((task) => task.status === "todo").length;
    const doneCount = tasks.filter((task) => task.status === "done").length;
    taskSummary.textContent = `${openCount} offen, ${doneCount} erledigt`;
  }

  function removeTask(taskId) {
    tasks = tasks.filter((task) => task.id !== taskId);
    saveTasks();
    renderTasks();
  }

  function toggleTask(taskId) {
    tasks = tasks.map((task) => {
      if (task.id !== taskId) {
        return task;
      }
      return { ...task, status: task.status === "done" ? "todo" : "done" };
    });
    saveTasks();
    renderTasks();
  }

  function renderTasks() {
    taskList.innerHTML = "";

    if (tasks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "task-empty";
      empty.textContent = "Noch keine Aufgaben eingetragen.";
      taskList.appendChild(empty);
      updateTaskSummary();
      return;
    }

    const sorted = tasks.slice().sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "todo" ? -1 : 1;
      }
      if (a.dueDate && b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate);
      }
      if (a.dueDate) { return -1; }
      if (b.dueDate) { return 1; }
      return 0;
    });

    sorted.forEach((task) => {
      const item = document.createElement("li");
      item.className = "task-item";

      const line = document.createElement("label");
      line.className = "checkline";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = task.status === "done";
      checkbox.addEventListener("change", () => toggleTask(task.id));

      const titleEl = document.createElement("p");
      titleEl.className = "task-item-title";
      if (task.status === "done") {
        titleEl.classList.add("done");
      }
      titleEl.textContent = task.title;

      line.appendChild(checkbox);
      line.appendChild(titleEl);
      item.appendChild(line);

      if (task.dueDate) {
        const meta = document.createElement("p");
        meta.className = "task-meta";
        meta.textContent = `Fällig: ${shortDateFormatter.format(parseKey(task.dueDate))}`;
        item.appendChild(meta);
      }

      if (task.creatorName) {
        const creator = document.createElement("p");
        creator.className = "task-meta";
        creator.textContent = `Von: ${task.creatorName}`;
        item.appendChild(creator);
      }

      const actions = document.createElement("div");
      actions.className = "task-actions";

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "mini-btn warn";
      deleteBtn.textContent = "Löschen";
      deleteBtn.addEventListener("click", () => removeTask(task.id));
      actions.appendChild(deleteBtn);

      item.appendChild(actions);
      taskList.appendChild(item);
    });

    updateTaskSummary();
  }

  taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = taskTitleInput.value.trim();
    if (!title) {
      return;
    }
    tasks.unshift({
      id: createTaskId(),
      title,
      dueDate: taskDueDateInput.value || "",
      status: "todo",
      creatorName: session ? session.displayName : ""
    });
    saveTasks();
    renderTasks();
    taskForm.reset();
  });

  renderTasks();
}

function initCardsPage() {
  const incidentForm = document.getElementById("incidentForm");
  const incidentDateInput = document.getElementById("incidentDate");
  const incidentPersonInput = document.getElementById("incidentPerson");
  const incidentTypeInput = document.getElementById("incidentType");
  const incidentDescriptionInput = document.getElementById("incidentDescription");
  const incidentList = document.getElementById("incidentList");
  const statsList = document.getElementById("statsList");
  const filterAllCards = document.getElementById("filterAllCards");
  const filterYellowCards = document.getElementById("filterYellowCards");
  const filterRedCards = document.getElementById("filterRedCards");
  const incidentSubmitBtn = document.getElementById("incidentSubmitBtn");
  const incidentFormTitle = document.getElementById("incidentFormTitle");
  const incidentCancelEditBtn = document.getElementById("incidentCancelEditBtn");

  if (
    !incidentForm ||
    !incidentDateInput ||
    !incidentPersonInput ||
    !incidentTypeInput ||
    !incidentDescriptionInput ||
    !incidentList ||
    !statsList ||
    !filterAllCards ||
    !filterYellowCards ||
    !filterRedCards ||
    !incidentSubmitBtn ||
    !incidentFormTitle ||
    !incidentCancelEditBtn
  ) {
    return;
  }

  const CARDS_STORAGE_KEY = "ferienwohnung_incidents_v1";
  const longDateFormatter = new Intl.DateTimeFormat("de-DE", { dateStyle: "long" });
  let incidentFilter = "all";
  let editingIncidentId = null;
  let incidents = loadIncidents();

  function createIncidentId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  }

  function loadIncidents() {
    try {
      const raw = localStorage.getItem(CARDS_STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter((item) => {
        return (
          item &&
          typeof item.id === "string" &&
          typeof item.date === "string" &&
          typeof item.person === "string" &&
          (item.type === "yellow" || item.type === "red") &&
          typeof item.description === "string"
        );
      });
    } catch {
      return [];
    }
  }

  function saveIncidents() {
    localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(incidents));
  }

  function normalizePersonName(value) {
    return value.trim().replace(/\s+/g, " ");
  }

  function getPeopleStats() {
    const byPerson = new Map();

    incidents.forEach((incident) => {
      const key = incident.person.toLowerCase();
      const existing = byPerson.get(key) || {
        displayName: incident.person,
        yellow: 0,
        red: 0,
        total: 0
      };

      if (incident.type === "red") {
        existing.red += 1;
      } else {
        existing.yellow += 1;
      }
      existing.total += 1;
      byPerson.set(key, existing);
    });

    return [...byPerson.values()];
  }

  function formatTopPeople(list, metric) {
    if (list.length === 0 || list[0][metric] === 0) {
      return "Keine Daten";
    }

    const maxValue = list[0][metric];
    const top = list.filter((person) => person[metric] === maxValue);
    const names = top.map((person) => person.displayName).join(", ");
    return `${names} (${maxValue})`;
  }

  function weekdayWithMostIncidents() {
    if (incidents.length === 0) {
      return "Keine Daten";
    }

    const counts = new Map();
    incidents.forEach((incident) => {
      const weekday = new Date(incident.date).getDay();
      counts.set(weekday, (counts.get(weekday) || 0) + 1);
    });

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const weekday = sorted[0][0];
    const label = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"][weekday];
    return `${label} (${sorted[0][1]})`;
  }

  function longestStreak() {
    if (incidents.length === 0) {
      return "Keine Daten";
    }

    const uniqueDays = [...new Set(incidents.map((incident) => incident.date))].sort();
    let maxStreak = 1;
    let currentStreak = 1;

    for (let i = 1; i < uniqueDays.length; i += 1) {
      const prev = parseKey(uniqueDays[i - 1]);
      const current = parseKey(uniqueDays[i]);
      const diffInDays = Math.round((current - prev) / 86400000);
      if (diffInDays === 1) {
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
      }
    }

    return `${maxStreak} Tage`;
  }

  function renderStats() {
    statsList.innerHTML = "";
    const total = incidents.length;
    const totalRed = incidents.filter((item) => item.type === "red").length;
    const totalYellow = incidents.filter((item) => item.type === "yellow").length;
    const redShare = total === 0 ? 0 : Math.round((totalRed / total) * 100);
    const people = getPeopleStats().sort((a, b) => b.total - a.total || b.red - a.red || b.yellow - a.yellow);
    const byRed = [...people].sort((a, b) => b.red - a.red || b.total - a.total);
    const byYellow = [...people].sort((a, b) => b.yellow - a.yellow || b.total - a.total);

    const statItems = [
      { title: "Meiste rote Karten", value: formatTopPeople(byRed, "red") },
      { title: "Meiste gelbe Karten", value: formatTopPeople(byYellow, "yellow") },
      { title: "Meiste Karten gesamt", value: formatTopPeople(people, "total") },
      { title: "Rote Karten Anteil", value: `${redShare}%` },
      { title: "Härtester Tag", value: weekdayWithMostIncidents() },
      { title: "Längste Karten-Serie", value: longestStreak() }
    ];

    statItems.forEach((stat) => {
      const li = document.createElement("li");
      li.className = "stat-item";

      const title = document.createElement("p");
      title.className = "stat-title";
      title.textContent = stat.title;

      const value = document.createElement("p");
      value.className = "stat-value";
      value.textContent = stat.value;

      li.appendChild(title);
      li.appendChild(value);
      statsList.appendChild(li);
    });
  }

  function filteredIncidents() {
    if (incidentFilter === "yellow") {
      return incidents.filter((item) => item.type === "yellow");
    }
    if (incidentFilter === "red") {
      return incidents.filter((item) => item.type === "red");
    }
    return incidents;
  }

  function removeIncident(id) {
    incidents = incidents.filter((item) => item.id !== id);
    if (editingIncidentId === id) {
      resetIncidentForm();
    }
    saveIncidents();
    renderIncidents();
    renderStats();
  }

  function startEditingIncident(id) {
    const incident = incidents.find((item) => item.id === id);
    if (!incident) {
      return;
    }

    editingIncidentId = id;
    incidentDateInput.value = incident.date;
    incidentPersonInput.value = incident.person;
    incidentTypeInput.value = incident.type;
    incidentDescriptionInput.value = incident.description;
    incidentFormTitle.textContent = "Karte bearbeiten";
    incidentSubmitBtn.textContent = "Änderung speichern";
    incidentCancelEditBtn.classList.remove("hidden");
  }

  function resetIncidentForm() {
    editingIncidentId = null;
    incidentForm.reset();
    incidentDateInput.value = toKey(new Date());
    incidentTypeInput.value = "yellow";
    incidentFormTitle.textContent = "Neue Karte erfassen";
    incidentSubmitBtn.textContent = "Karte erfassen";
    incidentCancelEditBtn.classList.add("hidden");
  }

  function renderIncidents() {
    incidentList.innerHTML = "";
    const list = filteredIncidents().slice().sort((a, b) => b.date.localeCompare(a.date));

    if (list.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-hint";
      empty.textContent = "Noch keine Karten erfasst.";
      incidentList.appendChild(empty);
      return;
    }

    list.forEach((incident) => {
      const li = document.createElement("li");
      li.className = "incident-item";

      const head = document.createElement("div");
      head.className = "incident-head";

      const person = document.createElement("p");
      person.className = "incident-person";
      person.textContent = incident.person;

      const badge = document.createElement("span");
      badge.className = `card-badge ${incident.type}`;
      badge.textContent = incident.type === "red" ? "Rot" : "Gelb";

      head.appendChild(person);
      head.appendChild(badge);

      const meta = document.createElement("p");
      meta.className = "incident-meta";
      meta.textContent = longDateFormatter.format(parseKey(incident.date));

      const description = document.createElement("p");
      description.className = "incident-description";
      description.textContent = incident.description;

      const actions = document.createElement("div");
      actions.className = "incident-actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "mini-btn soft";
      editBtn.textContent = "Bearbeiten";
      editBtn.addEventListener("click", () => startEditingIncident(incident.id));

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "mini-btn warn";
      deleteBtn.textContent = "Löschen";
      deleteBtn.addEventListener("click", () => removeIncident(incident.id));
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      li.appendChild(head);
      li.appendChild(meta);
      li.appendChild(description);
      li.appendChild(actions);
      incidentList.appendChild(li);
    });
  }

  incidentForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const date = incidentDateInput.value;
    const person = normalizePersonName(incidentPersonInput.value);
    const type = incidentTypeInput.value;
    const description = incidentDescriptionInput.value.trim();

    if (!date || !person || !description || (type !== "yellow" && type !== "red")) {
      return;
    }

    if (editingIncidentId) {
      incidents = incidents.map((item) => {
        if (item.id !== editingIncidentId) {
          return item;
        }
        return {
          ...item,
          date,
          person,
          type,
          description
        };
      });
    } else {
      incidents.unshift({
        id: createIncidentId(),
        date,
        person,
        type,
        description
      });
    }

    saveIncidents();
    renderIncidents();
    renderStats();
    resetIncidentForm();
  });

  incidentCancelEditBtn.addEventListener("click", () => {
    resetIncidentForm();
  });

  filterAllCards.addEventListener("change", () => {
    if (filterAllCards.checked) {
      incidentFilter = "all";
      renderIncidents();
    }
  });

  filterYellowCards.addEventListener("change", () => {
    if (filterYellowCards.checked) {
      incidentFilter = "yellow";
      renderIncidents();
    }
  });

  filterRedCards.addEventListener("change", () => {
    if (filterRedCards.checked) {
      incidentFilter = "red";
      renderIncidents();
    }
  });

  resetIncidentForm();
  renderIncidents();
  renderStats();
}

const authRouting = initAuthRouting();

if (authRouting.shouldInitLogin) {
  initLoginPage();
}

if (authRouting.shouldInitApp) {
  initTopbarAccount();
  initHomeNewsPage();
  initNewsManagerPage();
  initAccountsPage();
  initChecklistPage();
  initStayPlannerPage();
  initCalendarPage();
  initTasksPage();
  initCardsPage();
}
