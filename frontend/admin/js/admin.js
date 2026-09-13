/**
 * 后台管理系统脚本
 */

const API_BASE = '/api';

// 获取Token
function getToken() {
    return localStorage.getItem('adminToken');
}

// 检查登录状态
function checkAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = '/admin/login.html';
        return false;
    }
    return true;
}

// API请求
async function apiRequest(endpoint, options = {}) {
    const token = getToken();
    const config = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers
        },
        ...options
    };
    
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    const data = await response.json();
    
    if (response.status === 401) {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        window.location.href = '/admin/login.html';
        throw new Error('登录已过期');
    }
    
    if (!response.ok || data.code !== 200) {
        throw new Error(data.message || '请求失败');
    }
    
    return data;
}

// 文件上传
async function uploadFile(file) {
    const token = getToken();
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE}/admin/upload`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: formData
    });
    
    const data = await response.json();
    
    if (!response.ok || data.code !== 200) {
        throw new Error(data.message || '上传失败');
    }
    
    return data.data;
}

// Toast通知
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = { success: '✓', error: '✕' };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || '✓'}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// 转义HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 格式化日期
function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ==================== 页面导航 ====================

let currentPage = 'dashboard';

function navigateTo(page) {
    currentPage = page;
    
    // 更新导航状态
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) {
            item.classList.add('active');
        }
    });
    
    // 更新页面显示
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById(`page-${page}`);
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    // 加载页面数据
    loadPageData(page);
    
    // 更新URL hash
    window.location.hash = page;
}

function loadPageData(page) {
    switch (page) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'config':
            loadConfig();
            break;
        case 'life-events':
            loadLifeEvents();
            break;
        case 'photos':
            loadPhotos();
            break;
        case 'messages':
            loadMessages();
            break;
    }
}

// ==================== 仪表盘 ====================

async function loadDashboard() {
    try {
        const response = await apiRequest('/admin/dashboard');
        const stats = response.data.stats;

        document.getElementById('stat-events').textContent = stats.lifeEventsCount;
        document.getElementById('stat-photos').textContent = stats.photosCount;
        document.getElementById('stat-messages').textContent = stats.messagesCount;
        document.getElementById('stat-pending').textContent = stats.pendingMessagesCount;

        // 待发布草稿提醒（避免未完成文字被遗忘）
        const draftTotal = (stats.draftEventsCount || 0) + (stats.draftPhotosCount || 0) + (stats.draftConfigCount || 0);
        let draftBar = document.getElementById('draftReminder');
        if (draftTotal > 0) {
            if (!draftBar) {
                draftBar = document.createElement('div');
                draftBar.id = 'draftReminder';
                draftBar.className = 'draft-banner';
                draftBar.style.marginTop = '20px';
                document.getElementById('page-dashboard').appendChild(draftBar);
            }
            draftBar.style.display = 'flex';
            draftBar.innerHTML = `
                <div class="draft-banner-info">
                    <span class="draft-banner-icon">📝</span>
                    <div>
                        <strong>当前有 ${draftTotal} 项内容尚未发布</strong>
                        <p>生平事件草稿 ${stats.draftEventsCount || 0} 条、照片草稿 ${stats.draftPhotosCount || 0} 条、首页文案草稿 ${stats.draftConfigCount || 0} 项。草稿不会出现在前台。</p>
                    </div>
                </div>
                <div class="draft-banner-actions">
                    <button class="btn btn-secondary" onclick="previewSiteDraft()">👁 预览全部草稿</button>
                </div>`;
        } else if (draftBar) {
            draftBar.style.display = 'none';
        }

    } catch (error) {
        console.error('加载仪表盘失败:', error);
    }
}

// ==================== 网站配置（首页文案：草稿/预览/发布） ====================

let configData = { configs: [], published: {}, drafts: {} };

async function loadConfig() {
    try {
        const response = await apiRequest('/admin/config');
        configData = response.data;

        // 回填表单（草稿值优先，便于继续编辑未发布的修改）
        configData.configs.forEach(config => {
            const input = document.getElementById(`config_${config.config_key}`);
            if (input) {
                input.value = config.value ?? config.config_value ?? '';
                // 标记该字段是否处于草稿状态
                input.classList.toggle('is-draft-input', config.draft_value !== null);
            }
        });

        updateConfigDraftBanner();

    } catch (error) {
        showToast('加载配置失败', 'error');
    }
}

function updateConfigDraftBanner() {
    const banner = document.getElementById('configDraftBanner');
    const count = configData.draft_count ?? Object.keys(configData.drafts || {}).length;
    if (!banner) return;

    if (count > 0) {
        banner.style.display = 'flex';
        document.getElementById('configDraftTitle').textContent = `有 ${count} 项首页文案草稿待发布`;
    } else {
        banner.style.display = 'none';
    }
}

// 从表单收集可编辑文案
function collectConfigForm() {
    const form = document.getElementById('configForm');
    const inputs = form.querySelectorAll('input:not([readonly]), textarea');
    const configs = {};
    inputs.forEach(input => {
        if (input.name) configs[input.name] = input.value;
    });
    return configs;
}

// 保存草稿（前台首页不受影响）
async function saveConfig(e) {
    e.preventDefault();
    const configs = collectConfigForm();

    try {
        const res = await apiRequest('/admin/config', {
            method: 'POST',
            body: JSON.stringify({ configs })
        });

        configData.draft_count = res.data?.draft_count ?? 0;
        showToast(res.message || '草稿已保存');
        updateConfigDraftBanner();

    } catch (error) {
        showToast(error.message || '保存失败', 'error');
    }
}

// 生成预览链接并在新标签打开（链接带签名 token，7天有效，noindex 不收录）
async function previewConfig() {
    // 先把当前表单内容存为草稿，保证预览到的是最新修改
    const configs = collectConfigForm();
    try {
        await apiRequest('/admin/config', {
            method: 'POST',
            body: JSON.stringify({ configs })
        });

        const res = await apiRequest('/admin/config/preview-token');
        window.open(res.data.preview_url, '_blank');
    } catch (error) {
        showToast(error.message || '生成预览失败', 'error');
    }
}

// 发布草稿到正式首页
async function publishConfig() {
    showConfirm('确认发布当前所有首页文案草稿吗？发布后线上首页将立即更新。', async () => {
        try {
            const res = await apiRequest('/admin/config/publish', { method: 'POST' });
            showToast(res.message || '发布成功');
            await loadConfig();
            loadDashboard();
        } catch (error) {
            showToast(error.message || '发布失败', 'error');
        }
    });
}

// 放弃全部首页文案草稿，恢复为已发布内容
async function discardConfigDrafts() {
    showConfirm('放弃后，首页文案将恢复为当前线上版本，未发布的修改会丢失。确定吗？', async () => {
        try {
            await apiRequest('/admin/config/discard', { method: 'POST' });
            showToast('已放弃草稿');
            await loadConfig();
            loadDashboard();
        } catch (error) {
            showToast(error.message || '操作失败', 'error');
        }
    });
}

// 仪表盘入口：预览整站全部草稿
async function previewSiteDraft() {
    try {
        const res = await apiRequest('/admin/config/preview-token?scope=site');
        window.open(res.data.preview_url, '_blank');
    } catch (error) {
        showToast(error.message || '生成预览失败', 'error');
    }
}

// ==================== 生平事件（草稿/预览/发布） ====================

let eventsData = [];

function eventStatusBadge(event) {
    if (Number(event.status) === 0) {
        return '<span class="status-badge status-draft">草稿（未发布）</span>';
    }
    if (Number(event.has_draft) === 1) {
        return '<span class="status-badge status-changed">已发布 · 有草稿改动</span>';
    }
    return '<span class="status-badge status-approved">已发布</span>';
}

async function loadLifeEvents() {
    const tbody = document.getElementById('eventsTableBody');

    try {
        const response = await apiRequest('/admin/life-events');
        eventsData = response.data || [];

        if (eventsData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#666;">暂无数据</td></tr>';
            return;
        }

        tbody.innerHTML = eventsData.map(event => `
            <tr class="${Number(event.status) === 0 ? 'row-draft' : (Number(event.has_draft) === 1 ? 'row-changed' : '')}">
                <td>${event.id}</td>
                <td>${formatDate(event.effective_event_date || event.event_date)}</td>
                <td>${escapeHtml(event.effective_title || event.title)}</td>
                <td>${escapeHtml((event.effective_content || event.content || '').substring(0, 50))}...</td>
                <td>${eventStatusBadge(event)}</td>
                <td>${event.effective_sort_order ?? event.sort_order}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-secondary btn-icon" onclick="editEvent(${event.id})" title="编辑">✏️</button>
                    <button class="btn btn-sm btn-secondary btn-icon" onclick="previewEvent(${event.id})" title="预览">👁</button>
                    ${Number(event.has_draft) === 1 ? `<button class="btn btn-sm btn-success btn-icon" onclick="publishEvent(${event.id})" title="发布">✅</button>
                    <button class="btn btn-sm btn-warning btn-icon" onclick="discardEventDraft(${event.id})" title="放弃草稿">↩️</button>` : ''}
                    <button class="btn btn-sm btn-danger btn-icon" onclick="deleteEvent(${event.id})" title="删除">🗑️</button>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#f00;">加载失败</td></tr>';
    }
}

function showEventModal(event = null) {
    const modal = document.getElementById('eventModal');
    const title = document.getElementById('eventModalTitle');
    const publishBtn = document.getElementById('eventPublishBtn');
    const previewBtn = document.getElementById('eventPreviewBtn');

    document.getElementById('eventId').value = event?.id || '';
    // 编辑已有记录时，表单展示草稿（effective_*）内容；新建时为空
    document.getElementById('eventDate').value = event ? (event.effective_event_date || event.event_date || '') : '';
    document.getElementById('eventTitle').value = event ? (event.effective_title || event.title || '') : '';
    document.getElementById('eventContent').value = event ? (event.effective_content ?? event.content ?? '') : '';
    document.getElementById('eventSort').value = event ? (event.effective_sort_order ?? event.sort_order ?? 0) : 0;

    // 新建草稿时，弹窗内的"预览/发布"需先保存草稿后才能用
    const isNew = !event;
    previewBtn.disabled = isNew;
    publishBtn.disabled = isNew;
    previewBtn.title = isNew ? '请先"保存草稿"后再预览' : '';
    publishBtn.title = isNew ? '请先"保存草稿"后再发布' : '';

    title.textContent = event ? '编辑事件（保存为草稿，不影响线上）' : '添加事件（先存草稿，预览后发布）';
    modal.classList.add('active');
}

function closeEventModal() {
    document.getElementById('eventModal').classList.remove('active');
}

function editEvent(id) {
    const event = eventsData.find(e => Number(e.id) === id);
    if (event) {
        showEventModal(event);
    }
}

// 收集弹窗表单
function collectEventForm() {
    return {
        event_date: document.getElementById('eventDate').value,
        title: document.getElementById('eventTitle').value,
        content: document.getElementById('eventContent').value,
        sort_order: parseInt(document.getElementById('eventSort').value, 10) || 0
    };
}

function validateEventForm() {
    if (!document.getElementById('eventDate').value) {
        showToast('请选择事件日期', 'error');
        return false;
    }
    if (!document.getElementById('eventTitle').value.trim()) {
        showToast('请填写事件标题', 'error');
        return false;
    }
    return true;
}

// 保存草稿（新建或更新都不会改动线上已发布内容）
async function saveEvent(e) {
    e.preventDefault();
    if (!validateEventForm()) return;

    const id = document.getElementById('eventId').value;
    const data = collectEventForm();

    try {
        let savedId = id;
        if (id) {
            await apiRequest(`/admin/life-events/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
        } else {
            const res = await apiRequest('/admin/life-events', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            savedId = res.data?.id;
            document.getElementById('eventId').value = savedId || '';
            // 保存后即可在弹窗内继续预览/发布
            document.getElementById('eventPreviewBtn').disabled = false;
            document.getElementById('eventPublishBtn').disabled = false;
        }

        showToast('草稿已保存，可点击"预览"查看效果');
        loadLifeEvents();
        loadDashboard();

    } catch (error) {
        showToast(error.message || '保存失败', 'error');
    }
}

// 弹窗内：先保存草稿，再打开预览
async function previewCurrentEvent() {
    const id = document.getElementById('eventId').value;
    if (!id) {
        showToast('请先保存草稿', 'error');
        return;
    }
    if (!validateEventForm()) return;

    try {
        await apiRequest(`/admin/life-events/${id}`, {
            method: 'PUT',
            body: JSON.stringify(collectEventForm())
        });
        await openEventPreview(id);
    } catch (error) {
        showToast(error.message || '预览失败', 'error');
    }
}

// 列表行：直接生成该事件预览链接
async function previewEvent(id) {
    await openEventPreview(id);
}

async function openEventPreview(id) {
    try {
        const res = await apiRequest(`/admin/life-events/${id}/preview-token`);
        window.open(res.data.preview_url, '_blank');
    } catch (error) {
        showToast(error.message || '生成预览链接失败', 'error');
    }
}

// 弹窗内发布当前事件（会先保存一次，确保发布的是最新内容）
async function publishCurrentEvent() {
    const id = document.getElementById('eventId').value;
    if (!id) {
        showToast('请先保存草稿', 'error');
        return;
    }
    if (!validateEventForm()) return;

    try {
        await apiRequest(`/admin/life-events/${id}`, {
            method: 'PUT',
            body: JSON.stringify(collectEventForm())
        });
        await doPublishEvent(id);
        closeEventModal();
    } catch (error) {
        showToast(error.message || '发布失败', 'error');
    }
}

async function publishEvent(id) {
    showConfirm('确认发布该事件吗？发布后将立即出现在前台时间线。', () => doPublishEvent(id));
}

async function doPublishEvent(id) {
    try {
        await apiRequest(`/admin/life-events/${id}/publish`, { method: 'POST' });
        showToast('已发布');
        loadLifeEvents();
        loadDashboard();
    } catch (error) {
        showToast(error.message || '发布失败', 'error');
    }
}

async function discardEventDraft(id) {
    showConfirm('放弃草稿后，将恢复为当前线上版本（未发布过的新草稿会被删除）。确定吗？', async () => {
        try {
            await apiRequest(`/admin/life-events/${id}/discard`, { method: 'POST' });
            showToast('已放弃草稿');
            loadLifeEvents();
            loadDashboard();
        } catch (error) {
            showToast(error.message || '操作失败', 'error');
        }
    });
}

async function deleteEvent(id) {
    showConfirm('确定要删除这个事件吗？已发布内容与草稿将一并删除。', async () => {
        try {
            await apiRequest(`/admin/life-events/${id}`, { method: 'DELETE' });
            showToast('事件删除成功');
            loadLifeEvents();
            loadDashboard();
        } catch (error) {
            showToast(error.message || '删除失败', 'error');
        }
    });
}

// ==================== 照片管理（草稿/预览/发布） ====================

let photosData = [];

function photoStatusBadge(photo) {
    if (Number(photo.status) === 0) {
        return '<span class="status-badge status-draft">草稿（未发布）</span>';
    }
    if (Number(photo.has_draft) === 1) {
        return '<span class="status-badge status-changed">已发布 · 有草稿改动</span>';
    }
    return '<span class="status-badge status-approved">已发布</span>';
}

async function loadPhotos() {
    const grid = document.getElementById('photosGrid');

    try {
        const response = await apiRequest('/admin/photos');
        photosData = response.data || [];

        if (photosData.length === 0) {
            grid.innerHTML = '<p style="text-align:center;color:#666;grid-column:1/-1;">暂无照片，点击上方按钮添加</p>';
            return;
        }

        grid.innerHTML = photosData.map(photo => {
            const img = photo.effective_image_url || photo.image_url;
            const title = photo.effective_title || photo.title;
            const desc = photo.effective_description ?? photo.description ?? '';
            return `
            <div class="photo-card ${Number(photo.status) === 0 ? 'card-draft' : (Number(photo.has_draft) === 1 ? 'card-changed' : '')}">
                <div class="photo-card-status">${photoStatusBadge(photo)}</div>
                <img class="photo-image" src="${escapeHtml(img)}" alt="${escapeHtml(title)}"
                     onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 200%22%3E%3Crect fill=%22%23ddd%22 width=%22300%22 height=%22200%22/%3E%3Ctext x=%22150%22 y=%22100%22 text-anchor=%22middle%22 fill=%22%23999%22%3E暂无图片%3C/text%3E%3C/svg%3E'">
                <div class="photo-info">
                    <h4 class="photo-title">${escapeHtml(title)}</h4>
                    <p class="photo-desc">${escapeHtml(desc) || '暂无描述'}</p>
                    <div class="photo-actions">
                        <button class="btn btn-sm btn-secondary" onclick="editPhoto(${photo.id})">编辑</button>
                        <button class="btn btn-sm btn-secondary" onclick="previewPhoto(${photo.id})">👁 预览</button>
                        ${Number(photo.has_draft) === 1 ? `<button class="btn btn-sm btn-success" onclick="publishPhoto(${photo.id})">✅ 发布</button>
                        <button class="btn btn-sm btn-warning" onclick="discardPhotoDraft(${photo.id})">↩️ 放弃草稿</button>` : ''}
                        <button class="btn btn-sm btn-danger" onclick="deletePhoto(${photo.id})">删除</button>
                    </div>
                </div>
            </div>
        `;
        }).join('');

    } catch (error) {
        grid.innerHTML = '<p style="text-align:center;color:#f00;grid-column:1/-1;">加载失败</p>';
    }
}

function showPhotoModal(photo = null) {
    const modal = document.getElementById('photoModal');
    const title = document.getElementById('photoModalTitle');
    const preview = document.getElementById('photoPreview');
    const placeholder = document.getElementById('uploadPlaceholder');
    const publishBtn = document.getElementById('photoPublishBtn');
    const previewBtn = document.getElementById('photoPreviewBtn');

    document.getElementById('photoId').value = photo?.id || '';
    document.getElementById('photoTitle').value = photo ? (photo.effective_title || photo.title || '') : '';
    document.getElementById('photoDescription').value = photo ? (photo.effective_description ?? photo.description ?? '') : '';
    document.getElementById('photoUrl').value = photo ? (photo.effective_image_url || photo.image_url || '') : '';
    document.getElementById('photoSort').value = photo ? (photo.effective_sort_order ?? photo.sort_order ?? 0) : 0;

    const imgUrl = photo ? (photo.effective_image_url || photo.image_url) : '';
    if (imgUrl) {
        preview.src = imgUrl;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        preview.src = '';
        preview.style.display = 'none';
        placeholder.style.display = 'block';
    }

    const isNew = !photo;
    previewBtn.disabled = isNew;
    publishBtn.disabled = isNew;
    previewBtn.title = isNew ? '请先"保存草稿"后再预览' : '';
    publishBtn.title = isNew ? '请先"保存草稿"后再发布' : '';

    title.textContent = photo ? '编辑照片（保存为草稿，不影响线上）' : '添加照片（先存草稿，预览后发布）';
    modal.classList.add('active');
}

function closePhotoModal() {
    document.getElementById('photoModal').classList.remove('active');
    document.getElementById('photoFile').value = '';
}

function editPhoto(id) {
    const photo = photosData.find(p => Number(p.id) === id);
    if (photo) {
        showPhotoModal(photo);
    }
}

async function handlePhotoUpload(file) {
    const preview = document.getElementById('photoPreview');
    const placeholder = document.getElementById('uploadPlaceholder');

    try {
        placeholder.innerHTML = '<span>⏳</span><p>上传中...</p>';

        const result = await uploadFile(file);

        document.getElementById('photoUrl').value = result.url;
        preview.src = result.url;
        preview.style.display = 'block';
        placeholder.style.display = 'none';

        showToast('图片上传成功');

    } catch (error) {
        placeholder.innerHTML = '<span>📷</span><p>点击上传照片</p>';
        showToast(error.message || '上传失败', 'error');
    }
}

function collectPhotoForm() {
    return {
        title: document.getElementById('photoTitle').value,
        description: document.getElementById('photoDescription').value,
        image_url: document.getElementById('photoUrl').value,
        sort_order: parseInt(document.getElementById('photoSort').value, 10) || 0
    };
}

function validatePhotoForm() {
    if (!document.getElementById('photoTitle').value.trim()) {
        showToast('请填写照片标题', 'error');
        return false;
    }
    if (!document.getElementById('photoUrl').value) {
        showToast('请上传照片', 'error');
        return false;
    }
    return true;
}

// 保存草稿（照片标题、说明的修改不会立即出现在线上相册）
async function savePhoto(e) {
    e.preventDefault();
    if (!validatePhotoForm()) return;

    const id = document.getElementById('photoId').value;
    const data = collectPhotoForm();

    try {
        let savedId = id;
        if (id) {
            await apiRequest(`/admin/photos/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
        } else {
            const res = await apiRequest('/admin/photos', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            savedId = res.data?.id;
            document.getElementById('photoId').value = savedId || '';
            document.getElementById('photoPreviewBtn').disabled = false;
            document.getElementById('photoPublishBtn').disabled = false;
        }

        showToast('草稿已保存，可点击"预览"查看效果');
        loadPhotos();
        loadDashboard();

    } catch (error) {
        showToast(error.message || '保存失败', 'error');
    }
}

async function previewCurrentPhoto() {
    const id = document.getElementById('photoId').value;
    if (!id) {
        showToast('请先保存草稿', 'error');
        return;
    }
    if (!validatePhotoForm()) return;

    try {
        await apiRequest(`/admin/photos/${id}`, {
            method: 'PUT',
            body: JSON.stringify(collectPhotoForm())
        });
        await openPhotoPreview(id);
    } catch (error) {
        showToast(error.message || '预览失败', 'error');
    }
}

async function previewPhoto(id) {
    await openPhotoPreview(id);
}

async function openPhotoPreview(id) {
    try {
        const res = await apiRequest(`/admin/photos/${id}/preview-token`);
        window.open(res.data.preview_url, '_blank');
    } catch (error) {
        showToast(error.message || '生成预览链接失败', 'error');
    }
}

async function publishCurrentPhoto() {
    const id = document.getElementById('photoId').value;
    if (!id) {
        showToast('请先保存草稿', 'error');
        return;
    }
    if (!validatePhotoForm()) return;

    try {
        await apiRequest(`/admin/photos/${id}`, {
            method: 'PUT',
            body: JSON.stringify(collectPhotoForm())
        });
        await doPublishPhoto(id);
        closePhotoModal();
    } catch (error) {
        showToast(error.message || '发布失败', 'error');
    }
}

async function publishPhoto(id) {
    showConfirm('确认发布这张照片吗？发布后将立即出现在前台相册。', () => doPublishPhoto(id));
}

async function doPublishPhoto(id) {
    try {
        await apiRequest(`/admin/photos/${id}/publish`, { method: 'POST' });
        showToast('已发布');
        loadPhotos();
        loadDashboard();
    } catch (error) {
        showToast(error.message || '发布失败', 'error');
    }
}

async function discardPhotoDraft(id) {
    showConfirm('放弃草稿后，照片标题与说明将恢复为当前线上版本（未发布过的新照片会被删除）。确定吗？', async () => {
        try {
            await apiRequest(`/admin/photos/${id}/discard`, { method: 'POST' });
            showToast('已放弃草稿');
            loadPhotos();
            loadDashboard();
        } catch (error) {
            showToast(error.message || '操作失败', 'error');
        }
    });
}

async function deletePhoto(id) {
    showConfirm('确定要删除这张照片吗？已发布内容与草稿将一并删除。', async () => {
        try {
            await apiRequest(`/admin/photos/${id}`, { method: 'DELETE' });
            showToast('照片删除成功');
            loadPhotos();
            loadDashboard();
        } catch (error) {
            showToast(error.message || '删除失败', 'error');
        }
    });
}

// ==================== 寄语管理 ====================

let messagesData = [];

const STATUS_LABELS = {
    0: { text: '待审核', class: 'status-pending' },
    1: { text: '已通过', class: 'status-approved' },
    2: { text: '已拒绝', class: 'status-rejected' }
};

async function loadMessages() {
    const tbody = document.getElementById('messagesTableBody');
    
    try {
        const response = await apiRequest('/admin/messages');
        messagesData = response.data || [];
        
        if (messagesData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#666;">暂无寄语</td></tr>';
            return;
        }
        
        tbody.innerHTML = messagesData.map(msg => {
            const status = STATUS_LABELS[msg.status] || STATUS_LABELS[0];
            return `
                <tr>
                    <td>${msg.id}</td>
                    <td>${escapeHtml(msg.author_name)}</td>
                    <td>${escapeHtml(msg.content.substring(0, 50))}...</td>
                    <td><span class="status-badge ${status.class}">${status.text}</span></td>
                    <td>${formatDate(msg.created_at)}</td>
                    <td class="actions">
                        ${msg.status === 0 ? `
                            <button class="btn btn-sm btn-success btn-icon" onclick="updateMessageStatus(${msg.id}, 1)" title="通过">✓</button>
                            <button class="btn btn-sm btn-danger btn-icon" onclick="updateMessageStatus(${msg.id}, 2)" title="拒绝">✕</button>
                        ` : ''}
                        <button class="btn btn-sm btn-danger btn-icon" onclick="deleteMessage(${msg.id})" title="删除">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#f00;">加载失败</td></tr>';
    }
}

async function updateMessageStatus(id, status) {
    const statusText = status === 1 ? '通过' : '拒绝';
    
    try {
        await apiRequest(`/admin/messages/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
        
        showToast(`已${statusText}该寄语`);
        loadMessages();
        loadDashboard();
        
    } catch (error) {
        showToast(error.message || '操作失败', 'error');
    }
}

async function deleteMessage(id) {
    showConfirm('确定要删除这条寄语吗？', async () => {
        try {
            await apiRequest(`/admin/messages/${id}`, { method: 'DELETE' });
            showToast('寄语删除成功');
            loadMessages();
            loadDashboard();
        } catch (error) {
            showToast(error.message || '删除失败', 'error');
        }
    });
}

// ==================== 确认对话框 ====================

let confirmCallback = null;

function showConfirm(message, callback) {
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmModal').classList.add('active');
    confirmCallback = callback;
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('active');
    confirmCallback = null;
}

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', () => {
    // 检查登录状态
    if (!checkAuth()) return;
    
    // 加载用户信息
    const user = JSON.parse(localStorage.getItem('adminUser') || '{}');
    document.getElementById('userName').textContent = user.nickname || '管理员';
    document.getElementById('userAvatar').textContent = (user.nickname || 'A').charAt(0).toUpperCase();
    
    // 导航点击事件
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(item.dataset.page);
        });
    });
    
    // 移动端菜单切换
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('active');
    });
    
    // 退出登录
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        window.location.href = '/admin/login.html';
    });
    
    // 配置表单提交
    document.getElementById('configForm').addEventListener('submit', saveConfig);
    
    // 事件表单提交
    document.getElementById('eventForm').addEventListener('submit', saveEvent);
    
    // 照片表单提交
    document.getElementById('photoForm').addEventListener('submit', savePhoto);
    
    // 照片上传
    document.getElementById('photoFile').addEventListener('change', (e) => {
        if (e.target.files[0]) {
            handlePhotoUpload(e.target.files[0]);
        }
    });
    
    // 确认按钮
    document.getElementById('confirmBtn').addEventListener('click', () => {
        if (confirmCallback) {
            confirmCallback();
        }
        closeConfirmModal();
    });
    
    // 根据URL hash导航
    const hash = window.location.hash.slice(1) || 'dashboard';
    navigateTo(hash);
    
    console.log('后台管理系统已加载');
});
