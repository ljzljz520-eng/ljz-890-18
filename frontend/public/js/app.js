/**
 * 亚尔买买提・阿不来提纪念网站 - 主脚本
 * 版权所有 © 合肥市奕宁云网络科技有限公司 www.yiningyun.com
 */

// API基础地址
const API_BASE = '/api';

// ==================== 预览模式 ====================

/**
 * 预览模式：后台保存草稿后，通过带 preview_token 的 /preview 链接打开。
 * - 数据来自 /api/preview/site（草稿合并后的"接近前台"效果）
 * - 无有效 token 时后端返回 403，草稿不会泄露
 * - 页面注入 noindex、顶部预览横幅，搜索引擎不会收录
 */
const PREVIEW = (() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('preview_token');
    const isPreviewPath = window.location.pathname.replace(/\/+$/, '') === '/preview';
    if (!token || !isPreviewPath) {
        return { active: false };
    }
    return {
        active: true,
        token,
        scope: params.get('scope') || 'site',
        id: params.get('id') ? parseInt(params.get('id'), 10) : null,
    };
})();

// 预览模式的鉴权头（其余请求不需要）
function previewHeaders(extra = {}) {
    if (!PREVIEW.active) return extra;
    return { Authorization: `Bearer ${PREVIEW.token}`, ...extra };
}

/**
 * 预览数据（单次加载后缓存，各模块共用）
 */
let previewDataCache = null;
async function loadPreviewData() {
    if (previewDataCache) return previewDataCache;

    const query = new URLSearchParams();
    if (PREVIEW.scope && PREVIEW.scope !== 'site') query.set('scope', PREVIEW.scope);
    if (PREVIEW.id) query.set('id', String(PREVIEW.id));

    // token 同时通过查询参数传递（中间件两者都支持）
    query.set('preview_token', PREVIEW.token);
    const response = await fetch(`${API_BASE}/preview/site?${query.toString()}`, {
        headers: previewHeaders()
    });
    const data = await response.json();

    if (!response.ok || data.code !== 200) {
        throw new Error(data.message || '预览数据加载失败');
    }

    previewDataCache = data.data;
    window.__previewDraftCounts = previewDataCache.draft_counts;
    window.__previewDraftIds = previewDataCache.draft_ids;
    return previewDataCache;
}

/**
 * 标记页面不被搜索引擎收录（与 HTTP 头、robots.txt 多重保险）
 */
function enforcePreviewNoindex() {
    if (!PREVIEW.active) return;

    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow, noarchive';
    document.head.appendChild(meta);

    // 链接统一加 nofollow，防止权重传递/继续抓取
    document.querySelectorAll('a[href]').forEach(a => a.setAttribute('rel', 'nofollow noopener'));
}

/**
 * 顶部预览横幅：提示当前为草稿预览，提供"返回后台/发布"操作
 */
function showPreviewBanner() {
    if (!PREVIEW.active) return;

    const scopeText = {
        site: '整站草稿',
        config: '首页文案草稿',
        event: '生平事件草稿',
        photo: '照片草稿',
    }[PREVIEW.scope] || '草稿';

    const backHash = {
        site: 'dashboard',
        config: 'config',
        event: 'life-events',
        photo: 'photos',
    }[PREVIEW.scope] || 'dashboard';

    const banner = document.createElement('div');
    banner.id = 'previewBanner';
    banner.innerHTML = `
        <div class="preview-banner-inner">
            <div class="preview-banner-info">
                <span class="preview-badge">预览</span>
                <span>您正在查看<strong>${escapeHtml(scopeText)}</strong>的效果，此页面不会被搜索引擎收录，普通访客不可见。</span>
            </div>
            <div class="preview-banner-actions">
                <a class="preview-btn preview-btn-ghost" href="/admin/#${backHash}">返回后台修改</a>
                <button class="preview-btn preview-btn-primary" id="previewPublishBtn">确认无误，立即发布</button>
            </div>
        </div>
    `;
    document.body.prepend(banner);
    document.body.classList.add('preview-mode');

    document.getElementById('previewPublishBtn').addEventListener('click', publishFromPreview);
}

async function publishFromPreview() {
    const btn = document.getElementById('previewPublishBtn');
    btn.disabled = true;
    btn.textContent = '发布中...';

    try {
        const payload = { scope: PREVIEW.scope === 'site' ? 'site' : PREVIEW.scope };
        if (PREVIEW.id) payload.id = PREVIEW.id;

        const res = await apiRequest('/preview/publish', {
            method: 'POST',
            headers: previewHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(payload),
        });

        const p = res.data?.published || {};
        const total = (p.events || 0) + (p.photos || 0) + (p.config || 0);
        showToast(total > 0 ? '发布成功，正在跳转到正式页面...' : '没有待发布的草稿');
        setTimeout(() => { window.location.href = '/'; }, 1000);
    } catch (error) {
        showToast(error.message || '发布失败，请回后台重试', 'error');
        btn.disabled = false;
        btn.textContent = '确认无误，立即发布';
    }
}

// ==================== 工具函数 ====================

/**
 * 发起API请求
 */
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };
    
    try {
        const response = await fetch(url, config);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || '请求失败');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

/**
 * 显示Toast通知
 */
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠'
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.success}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;
    
    container.appendChild(toast);
    
    // 自动移除
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/**
 * 格式化日期
 */
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日`;
}

// ==================== 时间计算模块 ====================

/**
 * 计算并更新离开时间
 */
function updateTimeSince() {
    const deathDate = new Date(window.__configuredDeathDate || '2011-11-01');
    const now = new Date();
    
    let years = now.getFullYear() - deathDate.getFullYear();
    let months = now.getMonth() - deathDate.getMonth();
    let days = now.getDate() - deathDate.getDate();
    
    if (days < 0) {
        months--;
        const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        days += prevMonth.getDate();
    }
    
    if (months < 0) {
        years--;
        months += 12;
    }
    
    // 更新DOM
    const yearsEl = document.getElementById('years');
    const monthsEl = document.getElementById('months');
    const daysEl = document.getElementById('days');
    
    if (yearsEl) yearsEl.textContent = years;
    if (monthsEl) monthsEl.textContent = months;
    if (daysEl) daysEl.textContent = days;
}

// ==================== 导航栏 ====================

/**
 * 初始化导航栏
 */
function initNavbar() {
    const navbar = document.getElementById('navbar');
    const mobileToggle = document.getElementById('mobileToggle');
    const navLinks = document.getElementById('navLinks');
    
    // 滚动效果
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
    
    // 移动端菜单切换
    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }
    
    // 导航链接点击
    const links = document.querySelectorAll('.nav-link');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            // 移除所有active类
            links.forEach(l => l.classList.remove('active'));
            // 添加当前active类
            link.classList.add('active');
            // 关闭移动端菜单
            navLinks.classList.remove('active');
        });
    });
    
    // 滚动时更新active状态
    const sections = document.querySelectorAll('section[id]');
    window.addEventListener('scroll', () => {
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop - 100;
            if (window.scrollY >= sectionTop) {
                current = section.getAttribute('id');
            }
        });
        
        links.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });
}

// ==================== 生平时间线 ====================

/**
 * 加载生平事件
 */
async function loadLifeEvents() {
    const container = document.getElementById('timelineContainer');

    try {
        const events = PREVIEW.active
            ? (await loadPreviewData()).life_events
            : (await apiRequest('/life-events')).data || [];

        if (events.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#666;">暂无生平事件</p>';
            return;
        }

        container.innerHTML = events.map((event, index) => `
            <div class="timeline-item fade-in ${PREVIEW.active && Number(event.has_draft) === 1 ? 'is-draft' : ''}"
                 id="event-${event.id}"
                 style="animation-delay: ${index * 0.1}s">
                <div class="timeline-dot"></div>
                <div class="timeline-date">
                    ${formatDate(event.event_date)}
                    ${PREVIEW.active && Number(event.status) === 0 ? '<span class="preview-tag">未发布</span>' : ''}
                    ${PREVIEW.active && Number(event.has_draft) === 1 && Number(event.status) === 1 ? '<span class="preview-tag">草稿改动</span>' : ''}
                </div>
                <div class="timeline-content">
                    <h3>${escapeHtml(event.title)}</h3>
                    <p>${escapeHtml(event.content || '')}</p>
                </div>
            </div>
        `).join('');

    } catch (error) {
        container.innerHTML = '<p style="text-align:center;color:#666;">加载失败，请刷新重试</p>';
        console.error('加载生平事件失败:', error);
    }
}

// ==================== 照片集 ====================

/**
 * 加载照片
 */
async function loadPhotos() {
    const container = document.getElementById('galleryContainer');
    
    try {
        const photos = PREVIEW.active
            ? (await loadPreviewData()).photos
            : (await apiRequest('/photos')).data || [];

        if (photos.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#fff;">暂无照片</p>';
            return;
        }

        container.innerHTML = photos.map((photo, index) => `
            <div class="gallery-item fade-in ${PREVIEW.active && Number(photo.has_draft) === 1 ? 'is-draft' : ''}"
                 id="photo-${photo.id}"
                 style="animation-delay: ${index * 0.1}s"
                 onclick="openLightbox('${escapeHtml(photo.image_url)}')">
                <img src="${escapeHtml(photo.image_url)}" alt="${escapeHtml(photo.title)}"
                     onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 300%22%3E%3Crect fill=%22%23ddd%22 width=%22400%22 height=%22300%22/%3E%3Ctext x=%22200%22 y=%22150%22 text-anchor=%22middle%22 fill=%22%23999%22%3E暂无图片%3C/text%3E%3C/svg%3E'">
                <div class="gallery-overlay">
                    <div class="gallery-caption">
                        <h4>${escapeHtml(photo.title)}
                            ${PREVIEW.active && Number(photo.status) === 0 ? '<span class="preview-tag light">未发布</span>' : ''}
                            ${PREVIEW.active && Number(photo.has_draft) === 1 && Number(photo.status) === 1 ? '<span class="preview-tag light">草稿改动</span>' : ''}
                        </h4>
                        <p>${escapeHtml(photo.description || '')}</p>
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        container.innerHTML = '<p style="text-align:center;color:#fff;">加载失败，请刷新重试</p>';
        console.error('加载照片失败:', error);
    }
}

/**
 * 打开图片查看器
 */
function openLightbox(imageUrl) {
    const modal = document.getElementById('lightboxModal');
    const image = document.getElementById('lightboxImage');
    
    image.src = imageUrl;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

/**
 * 关闭图片查看器
 */
function closeLightbox() {
    const modal = document.getElementById('lightboxModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

/**
 * 初始化图片查看器
 */
function initLightbox() {
    const modal = document.getElementById('lightboxModal');
    const closeBtn = document.getElementById('lightboxClose');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeLightbox);
    }
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeLightbox();
            }
        });
    }
    
    // ESC键关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeLightbox();
        }
    });
}

// ==================== 纪念寄语 ====================

/**
 * 加载寄语
 */
async function loadMessages() {
    const container = document.getElementById('messagesContainer');
    
    try {
        const messages = PREVIEW.active
            ? (await loadPreviewData()).messages
            : (await apiRequest('/messages')).data || [];

        if (messages.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#666;">暂无寄语，成为第一个留言的人吧！</p>';
            return;
        }
        
        container.innerHTML = messages.map((msg, index) => `
            <div class="message-card fade-in" style="animation-delay: ${index * 0.1}s">
                <p class="message-content">${escapeHtml(msg.content)}</p>
                <div class="message-author">
                    <div class="message-avatar">${msg.author_name.charAt(0).toUpperCase()}</div>
                    <div>
                        <p class="message-name">${escapeHtml(msg.author_name)}</p>
                        <p class="message-date">${formatDate(msg.created_at)}</p>
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        container.innerHTML = '<p style="text-align:center;color:#666;">加载失败，请刷新重试</p>';
        console.error('加载寄语失败:', error);
    }
}

/**
 * 初始化留言表单
 */
function initMessageForm() {
    const form = document.getElementById('messageForm');
    
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const authorName = document.getElementById('authorName').value.trim();
        const content = document.getElementById('messageContent').value.trim();
        
        // 验证
        if (!authorName) {
            showToast('请输入您的称呼', 'error');
            return;
        }
        
        if (!content || content.length < 5) {
            showToast('寄语内容至少需要5个字符', 'error');
            return;
        }
        
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="loading-spinner" style="width:20px;height:20px;"></div> 提交中...';
        
        try {
            await apiRequest('/messages', {
                method: 'POST',
                body: JSON.stringify({
                    author_name: authorName,
                    content: content
                })
            });
            
            showToast('寄语提交成功，待审核后展示', 'success');
            form.reset();
            
        } catch (error) {
            showToast(error.message || '提交失败，请重试', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                提交寄语
            `;
        }
    });
}

// ==================== 配置加载 ====================

/**
 * 加载网站配置
 */
async function loadConfig() {
    try {
        const config = PREVIEW.active
            ? (await loadPreviewData()).config
            : (await apiRequest('/config')).data || {};

        // 更新页面内容
        if (config.site_title) {
            document.title = config.site_title;
        }

        if (config.father_name) {
            const nameEl = document.getElementById('fatherName');
            if (nameEl) nameEl.textContent = config.father_name;
        }

        if (config.father_name_uyghur) {
            const nameUyghurEl = document.getElementById('fatherNameUyghur');
            if (nameUyghurEl) nameUyghurEl.textContent = config.father_name_uyghur;
        }

        if (config.birth_date || config.death_date) {
            const birthEl = document.getElementById('birthDate');
            const deathEl = document.getElementById('deathDate');
            if (birthEl && config.birth_date) birthEl.textContent = formatDate(config.birth_date);
            if (deathEl && config.death_date) deathEl.textContent = formatDate(config.death_date);
            // 时间计数器以逝世日期为准
            if (config.death_date) {
                window.__configuredDeathDate = config.death_date;
                updateTimeSince();
            }
        }

        if (config.hero_quote) {
            const quoteEl = document.getElementById('heroQuote');
            if (quoteEl) quoteEl.textContent = `"${config.hero_quote}"`;
        }

        if (config.about_text) {
            const aboutEl = document.getElementById('aboutText');
            if (aboutEl) {
                aboutEl.innerHTML = config.about_text.split('\n').filter(p => p.trim()).map(p => `<p>${escapeHtml(p)}</p>`).join('');
            }
        }

        if (config.footer_text) {
            const footerEl = document.getElementById('footerMemorial');
            if (footerEl) footerEl.textContent = config.footer_text;
        }

    } catch (error) {
        console.error('加载配置失败:', error);
    }
}

// ==================== 工具函数 ====================

/**
 * HTML转义
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== 初始化 ====================

/**
 * 页面初始化
 */
document.addEventListener('DOMContentLoaded', () => {
    // 预览模式：noindex + 顶部横幅
    if (PREVIEW.active) {
        enforcePreviewNoindex();
        showPreviewBanner();

        // 预览是只读的：隐藏访客留言表单与后台入口
        const formContainer = document.querySelector('.message-form-container');
        if (formContainer) formContainer.style.display = 'none';
        const footerAdmin = document.querySelector('.footer-nav a[href="/admin/"]');
        if (footerAdmin) footerAdmin.style.display = 'none';

        // 预览数据加载失败（token过期/无效）时给出明确提示
        window.addEventListener('unhandledrejection', () => {});
    }

    // 初始化导航栏
    initNavbar();

    // 初始化时间计算
    updateTimeSince();
    // 每分钟更新一次（实际上每天才变化，但为了实时性）
    setInterval(updateTimeSince, 60000);

    // 初始化图片查看器
    initLightbox();

    // 初始化留言表单（预览模式下不初始化提交）
    if (!PREVIEW.active) {
        initMessageForm();
    }

    // 加载数据
    loadConfig();
    loadLifeEvents();
    loadPhotos();
    loadMessages();

    if (PREVIEW.active) {
        // 若预览授权失败，403 时提示并引导回后台
        loadPreviewData().catch((error) => {
            const container = document.getElementById('timelineContainer');
            if (container) {
                container.innerHTML = `
                    <div style="grid-column:1/-1;text-align:center;padding:40px;color:#666;">
                        <p style="font-size:16px;">🔒 ${escapeHtml(error.message)}</p>
                        <a href="/admin/" class="btn btn-primary" style="display:inline-block;margin-top:16px;text-decoration:none;">返回后台重新生成预览</a>
                    </div>`;
            }
        });

        // 数据异步渲染后，滚动到 #event-x / #photo-x 锚点
        if (window.location.hash) {
            const anchor = window.location.hash.slice(1);
            let tries = 0;
            const timer = setInterval(() => {
                const el = document.getElementById(anchor);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    clearInterval(timer);
                } else if (++tries > 20) {
                    clearInterval(timer);
                }
            }, 150);
        }
    }

    console.log('亚尔买买提・阿不来提纪念网站 - 已加载');
    console.log('版权所有 © 合肥市奕宁云网络科技有限公司 www.yiningyun.com');
});
