let items = [];
let categories = [];
const STORAGE_KEY = "checklist-items";
const CATEGORIES_KEY = "checklist-categories";
let editingId = null;
let pendingPath = [];
let completedPath = [];

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadItems() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        items = raw ? JSON.parse(raw) : [];
    } catch (e) {
        items = [];
    }
    let changed = false;
    items.forEach((it) => {
        if (!it.id) {
            it.id = uid();
            changed = true;
        }
    });
    if (changed) saveItems();
    loadCategories();
    render();
}

function saveItems() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
        console.error("No se pudo guardar", e);
    }
}

function loadCategories() {
    try {
        const raw = localStorage.getItem(CATEGORIES_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        categories = parsed.map((c) =>
            typeof c === "string" ? { name: c, parent: null } : c,
        );
    } catch (e) {
        categories = [];
    }
    renderCategoryOptions();
}

function saveCategories() {
    try {
        localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
    } catch (e) {
        console.error("No se pudo guardar categorías", e);
    }
}

function findCategory(name) {
    return categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
}

function addCategoryIfNew(cat) {
    const trimmed = cat.trim();
    if (!trimmed) return "General";
    const existing = findCategory(trimmed);
    if (!existing) {
        categories.push({ name: trimmed, parent: null });
        saveCategories();
        renderCategoryOptions();
        return trimmed;
    }
    return existing.name;
}

function getRootCategories() {
    return categories.filter((c) => !c.parent);
}

function getChildren(name) {
    return categories.filter(
        (c) => c.parent && c.parent.toLowerCase() === name.toLowerCase(),
    );
}

function isDescendant(ancestorName, candidateName) {
    let cur = findCategory(candidateName);
    const seen = new Set();
    while (cur && cur.parent) {
        if (cur.parent.toLowerCase() === ancestorName.toLowerCase()) return true;
        if (seen.has(cur.name)) break;
        seen.add(cur.name);
        cur = findCategory(cur.parent);
    }
    return false;
}

function getAvailableParents(catName) {
    return categories.filter(
        (c) =>
            c.name.toLowerCase() !== catName.toLowerCase() &&
            !isDescendant(catName, c.name),
    );
}

function renderCategoryOptions() {
    const datalist = document.getElementById("category-options");
    datalist.innerHTML = categories
        .map((c) => `<option value="${escapeHtml(c.name)}"></option>`)
        .join("");
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
}

function subtreeHasItems(catName, itemsList) {
    if (itemsList.some((it) => it.category === catName)) return true;
    return getChildren(catName).some((c) => subtreeHasItems(c.name, itemsList));
}

function render() {
    renderCategoryOptions();
    renderFolderView("pending");
    renderFolderView("completed");
    renderCategoriesModal();
}

function renderFolderView(sectionKey) {
    const isPending = sectionKey === "pending";
    const path = isPending ? pendingPath : completedPath;
    const itemsList = items.filter((it) => (isPending ? !it.done : it.done));
    const viewEl = document.getElementById(sectionKey + "-view");
    const crumbEl = document.getElementById(sectionKey + "-crumb");
    const emptyMsg = document.getElementById("empty-msg");
    const completedSection = document.getElementById("completed-section");

    if (!isPending) {
        completedSection.style.display = itemsList.length === 0 ? "none" : "block";
        if (itemsList.length === 0) {
            completedPath = [];
            return;
        }
    } else {
        if (items.filter((it) => !it.done).length === 0) {
            emptyMsg.style.display = "block";
            viewEl.innerHTML = "";
            crumbEl.style.display = "none";
            pendingPath = [];
            return;
        }
        emptyMsg.style.display = "none";
    }

    const currentCatName = path.length ? path[path.length - 1] : null;

    renderCrumb(crumbEl, sectionKey, isPending ? "Pendientes" : "Completadas", path);

    let subcats, tasksHere;
    if (currentCatName === null) {
        subcats = getRootCategories().filter((c) =>
            subtreeHasItems(c.name, itemsList),
        );
        tasksHere = [];
    } else {
        subcats = getChildren(currentCatName).filter((c) =>
            subtreeHasItems(c.name, itemsList),
        );
        tasksHere = itemsList.filter((it) => it.category === currentCatName);
    }

    viewEl.innerHTML = "";

    if (subcats.length === 0 && tasksHere.length === 0) {
        const p = document.createElement("div");
        p.className = "empty";
        p.textContent = "No hay nada aquí.";
        viewEl.appendChild(p);
        return;
    }

    if (subcats.length > 0) {
        const grid = document.createElement("div");
        grid.className = "folder-grid";
        subcats.forEach((c) => {
            const btn = document.createElement("button");
            btn.className = "folder-card";
            btn.innerHTML = `<span class="folder-icon">📁</span><span class="folder-name">${escapeHtml(c.name)}</span>`;
            btn.addEventListener("click", () => {
                path.push(c.name);
                render();
            });
            grid.appendChild(btn);
        });
        viewEl.appendChild(grid);
    }

    if (tasksHere.length > 0) {
        tasksHere.sort((a, b) => new Date(a.dateAdded) - new Date(b.dateAdded));
        const ul = document.createElement("ul");
        ul.className = "task-list";
        tasksHere.forEach((item) => ul.appendChild(buildLi(item)));
        viewEl.appendChild(ul);
    }
}

function renderCrumb(crumbEl, sectionKey, sectionLabel, path) {
    if (path.length === 0) {
        crumbEl.style.display = "none";
        crumbEl.innerHTML = "";
        return;
    }
    crumbEl.style.display = "flex";
    const parts = [sectionLabel, ...path];
    const trail = parts
        .map((label, idx) => {
            const isLast = idx === parts.length - 1;
            return `<span class="crumb-part${isLast ? " current" : ""}" data-idx="${idx}">${escapeHtml(label)}</span>`;
        })
        .join('<span class="crumb-sep"> / </span>');
    crumbEl.innerHTML = `
      <button class="back-btn" data-back>◀ Volver</button>
      <span class="crumb-trail">${trail}</span>
    `;
    crumbEl.querySelector("[data-back]").addEventListener("click", () => {
        const newPath = path.slice(0, -1);
        if (sectionKey === "pending") {
            pendingPath = newPath;
        } else {
            completedPath = newPath;
        }
        render();
    });
    crumbEl.querySelectorAll(".crumb-part").forEach((el) => {
        el.addEventListener("click", () => {
            const idx = +el.dataset.idx;
            if (idx === parts.length - 1) return;
            if (sectionKey === "pending") {
                pendingPath = path.slice(0, idx);
            } else {
                completedPath = path.slice(0, idx);
            }
            render();
        });
    });
}

function buildLi(item) {
    const li = document.createElement("li");
    if (item.done) li.classList.add("done");
    const delBtn = item.done
        ? ""
        : `<button class="icon-btn del" data-del="${item.id}" aria-label="Eliminar">×</button>`;
    li.innerHTML = `
    <input type="checkbox" ${item.done ? "checked" : ""} data-id="${item.id}">
    <div class="item-text">
      <span class="title">${escapeHtml(item.text)}</span>
      <span class="meta">${formatDate(item.dateAdded)}</span>
    </div>
    <button class="icon-btn edit" data-edit="${item.id}" aria-label="Editar">✎</button>
    ${delBtn}
  `;
    return li;
}

function deleteCategory(name) {
    const cat = findCategory(name);
    if (!cat) return;
    const ok = confirm(
        `¿Eliminar la categoría "${name}"? Sus subcategorías quedarán sin padre y sus tareas pasarán a "General".`,
    );
    if (!ok) return;

    categories
        .filter((c) => c.parent && c.parent.toLowerCase() === name.toLowerCase())
        .forEach((c) => {
            c.parent = null;
        });

    const generalName = addCategoryIfNew("General");
    items.forEach((it) => {
        if (it.category === name) it.category = generalName;
    });

    categories = categories.filter(
        (c) => c.name.toLowerCase() !== name.toLowerCase(),
    );

    pendingPath = truncatePathAt(pendingPath, name);
    completedPath = truncatePathAt(completedPath, name);

    saveCategories();
    saveItems();
    render();
}

function truncatePathAt(path, name) {
    const idx = path.findIndex((p) => p.toLowerCase() === name.toLowerCase());
    return idx === -1 ? path : path.slice(0, idx);
}

function renderCategoriesModal() {
    const list = document.getElementById("categories-list");
    if (categories.length === 0) {
        list.innerHTML = `<div class="empty">Todavía no hay categorías.</div>`;
        return;
    }
    list.innerHTML = "";
    categories.forEach((cat) => {
        const row = document.createElement("div");
        row.className = "category-row";
        const options = getAvailableParents(cat.name)
            .map(
                (p) =>
                    `<option value="${escapeHtml(p.name)}" ${cat.parent === p.name ? "selected" : ""}>${escapeHtml(p.name)}</option>`,
            )
            .join("");
        row.innerHTML = `
      <span class="category-row-name">${escapeHtml(cat.name)}</span>
      <select class="category-parent-select" data-cat="${escapeHtml(cat.name)}">
        <option value="">Ninguna</option>
        ${options}
      </select>
      <button class="icon-btn del category-del-btn" data-del-cat="${escapeHtml(cat.name)}" aria-label="Eliminar categoría">×</button>
    `;
        list.appendChild(row);
    });
    list.querySelectorAll(".category-parent-select").forEach((sel) => {
        sel.addEventListener("change", () => {
            const catName = sel.dataset.cat;
            const cat = findCategory(catName);
            cat.parent = sel.value || null;
            saveCategories();
            render();
        });
    });
    list.querySelectorAll(".category-del-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            deleteCategory(btn.dataset.delCat);
        });
    });
}

function openConfirm(text, category) {
    document.getElementById("confirm-text").textContent =
        `¿Agregar "${text}" (${category})?`;
    document.getElementById("confirm-overlay").classList.add("show");
}

function closeConfirm() {
    document.getElementById("confirm-overlay").classList.remove("show");
}

document.getElementById("add-btn").addEventListener("click", () => {
    const input = document.getElementById("new-item");
    const categoryRaw = document.getElementById("new-category").value.trim();
    const text = input.value.trim();
    if (!text) return;
    openConfirm(text, categoryRaw || "General");
});

document.getElementById("new-item").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("add-btn").click();
});

document.getElementById("new-category").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("add-btn").click();
});

document
    .getElementById("confirm-cancel")
    .addEventListener("click", closeConfirm);

document.getElementById("confirm-ok").addEventListener("click", () => {
    const input = document.getElementById("new-item");
    const categoryInput = document.getElementById("new-category");
    const text = input.value.trim();
    if (!text) {
        closeConfirm();
        return;
    }
    const category = addCategoryIfNew(categoryInput.value);
    items.push({
        id: uid(),
        text,
        category,
        done: false,
        dateAdded: new Date().toISOString(),
    });
    input.value = "";
    categoryInput.value = "";
    saveItems();
    render();
    closeConfirm();
});

document.body.addEventListener("click", (e) => {
    if (e.target.matches('input[type="checkbox"]')) {
        const id = e.target.dataset.id;
        const item = items.find((it) => it.id === id);
        item.done = e.target.checked;
        saveItems();
        render();
    }
    if (e.target.matches("button[data-del]")) {
        const id = e.target.dataset.del;
        items = items.filter((it) => it.id !== id);
        saveItems();
        render();
    }
    if (e.target.matches("button[data-edit]")) {
        editingId = e.target.dataset.edit;
        const item = items.find((it) => it.id === editingId);
        document.getElementById("edit-text").value = item.text;
        document.getElementById("edit-category").value = item.category || "General";
        document.getElementById("edit-overlay").classList.add("show");
    }
});

document.getElementById("edit-cancel").addEventListener("click", () => {
    document.getElementById("edit-overlay").classList.remove("show");
    editingId = null;
});

document.getElementById("edit-save").addEventListener("click", () => {
    if (editingId === null) return;
    const text = document.getElementById("edit-text").value.trim();
    if (!text) return;
    const item = items.find((it) => it.id === editingId);
    item.text = text;
    item.category = addCategoryIfNew(document.getElementById("edit-category").value);
    saveItems();
    render();
    document.getElementById("edit-overlay").classList.remove("show");
    editingId = null;
});

document.getElementById("manage-cats-btn").addEventListener("click", () => {
    renderCategoriesModal();
    document.getElementById("categories-overlay").classList.add("show");
});

document.getElementById("new-cat-btn").addEventListener("click", () => {
    const input = document.getElementById("new-cat-name");
    const name = input.value.trim();
    if (!name) return;
    addCategoryIfNew(name);
    input.value = "";
    render();
});

document.getElementById("new-cat-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("new-cat-btn").click();
});

document.getElementById("categories-close").addEventListener("click", () => {
    document.getElementById("categories-overlay").classList.remove("show");
});

loadItems();
