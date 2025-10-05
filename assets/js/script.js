// 平滑滚动效果
document.addEventListener('DOMContentLoaded', function() {
    // 平滑滚动到锚点
    const links = document.querySelectorAll('a[href^="#"]');
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // 导航栏滚动效果
    const header = document.querySelector('header');
    let lastScrollY = window.scrollY;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 100) {
            header.style.background = 'rgba(255, 255, 255, 0.95)';
            header.style.backdropFilter = 'blur(20px)';
        } else {
            header.style.background = 'var(--glass-bg)';
            header.style.backdropFilter = 'blur(20px)';
        }

        // 隐藏/显示导航栏
        if (window.scrollY > lastScrollY && window.scrollY > 200) {
            header.style.transform = 'translateY(-100%)';
        } else {
            header.style.transform = 'translateY(0)';
        }
        lastScrollY = window.scrollY;
    });

    // 鼠标移动效果
    const hero = document.querySelector('.hero');
    if (hero) {
        hero.addEventListener('mousemove', (e) => {
            const { left, top, width, height } = hero.getBoundingClientRect();
            const x = (e.clientX - left) / width - 0.5;
            const y = (e.clientY - top) / height - 0.5;

            hero.style.transform = `perspective(1000px) rotateX(${y * 2}deg) rotateY(${x * 2}deg)`;
        });

        hero.addEventListener('mouseleave', () => {
            hero.style.transform = 'perspective(1000px) rotateX(0) rotateY(0)';
        });
    }

    // 卡片悬停效果增强
    const cards = document.querySelectorAll('.post');
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const { left, top, width, height } = card.getBoundingClientRect();
            const x = (e.clientX - left) / width - 0.5;
            const y = (e.clientY - top) / height - 0.5;

            card.style.transform = `translateY(-8px) rotateX(${y * 2}deg) rotateY(${x * 2}deg)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(-8px) rotateX(0) rotateY(0)';
        });
    });

    // 打字机效果（可选）
    const heroTitle = document.querySelector('.hero h2');
    if (heroTitle) {
        const text = heroTitle.textContent;
        heroTitle.textContent = '';
        let i = 0;

        function typeWriter() {
            if (i < text.length) {
                heroTitle.textContent += text.charAt(i);
                i++;
                setTimeout(typeWriter, 100);
            }
        }

        // 延迟开始打字效果
        setTimeout(typeWriter, 1000);
    }
});

// BibTeX 弹窗功能
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('bibtex-modal');
    const bibtexContent = document.getElementById('bibtex-content');
    const copyBtn = document.getElementById('copy-bibtex');
    const closeBtn = document.querySelector('.close-btn');

    // 显示弹窗
    function showModal(bibtexText) {
        bibtexContent.textContent = bibtexText;
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden'; // 防止背景滚动
    }

    // 隐藏弹窗
    function hideModal() {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        copyBtn.classList.remove('copied');
        copyBtn.textContent = '复制到剪贴板';
    }

    // 复制到剪贴板
    async function copyToClipboard() {
        try {
            await navigator.clipboard.writeText(bibtexContent.textContent);
            copyBtn.classList.add('copied');
            copyBtn.textContent = '已复制!';

            // 2秒后恢复按钮状态
            setTimeout(() => {
                copyBtn.classList.remove('copied');
                copyBtn.textContent = '复制到剪贴板';
            }, 2000);
        } catch (err) {
            console.error('复制失败:', err);
            copyBtn.textContent = '复制失败';
        }
    }

    // 为所有引用链接添加点击事件
    const citationLinks = document.querySelectorAll('a[href="#"]');
    citationLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();

            // 查找最近的出版物卡片、预览项或详情页链接
            const publicationCard = this.closest('.publication-card');
            const publicationPreview = this.closest('.publication-preview');
            const publicationLinks = this.closest('.publication-links');

            if (publicationCard) {
                // 从数据属性获取 BibTeX 内容
                const bibtexData = publicationCard.dataset.bibtex;
                if (bibtexData) {
                    showModal(bibtexData);
                }
            } else if (publicationPreview) {
                // 从数据属性获取 BibTeX 内容
                const bibtexData = publicationPreview.dataset.bibtex;
                if (bibtexData) {
                    showModal(bibtexData);
                }
            } else if (publicationLinks) {
                // 从数据属性获取 BibTeX 内容
                const bibtexData = publicationLinks.dataset.bibtex;
                if (bibtexData) {
                    showModal(bibtexData);
                }
            }
        });
    });

    // 关闭按钮事件
    closeBtn.addEventListener('click', hideModal);

    // 点击弹窗外部关闭
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            hideModal();
        }
    });

    // ESC 键关闭弹窗
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'block') {
            hideModal();
        }
    });

    // 复制按钮事件
    copyBtn.addEventListener('click', copyToClipboard);
});

// 页面加载动画
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease';

    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 100);
});