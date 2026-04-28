document.addEventListener('DOMContentLoaded', function() {
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.getElementById('site-menu');
    const filterRoot = document.querySelector('[data-post-filter]');
    const postCards = Array.from(document.querySelectorAll('[data-post-categories]'));

    if (navToggle && navMenu) {
        navToggle.addEventListener('click', function() {
            const isOpen = document.body.classList.toggle('nav-open');
            navToggle.setAttribute('aria-expanded', String(isOpen));
            navToggle.setAttribute('aria-label', isOpen ? '关闭导航' : '打开导航');
        });

        navMenu.addEventListener('click', function(event) {
            if (event.target.closest('a')) {
                document.body.classList.remove('nav-open');
                navToggle.setAttribute('aria-expanded', 'false');
                navToggle.setAttribute('aria-label', '打开导航');
            }
        });
    }

    document.querySelectorAll('a[href^="#"]').forEach(function(link) {
        link.addEventListener('click', function(event) {
            const targetId = link.getAttribute('href');

            if (!targetId || targetId === '#') {
                return;
            }

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                event.preventDefault();
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    if (filterRoot && postCards.length) {
        const filterButtons = Array.from(filterRoot.querySelectorAll('[data-category]'));
        const categories = new Set(filterButtons.map(function(button) {
            return button.dataset.category;
        }));

        function applyPostFilter(category, updateUrl) {
            const activeCategory = categories.has(category) ? category : 'all';

            filterButtons.forEach(function(button) {
                const isActive = button.dataset.category === activeCategory;
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-pressed', String(isActive));
            });

            postCards.forEach(function(card) {
                const cardCategories = card.dataset.postCategories.split('|').filter(Boolean);
                const isHidden = activeCategory !== 'all' && !cardCategories.includes(activeCategory);
                card.hidden = isHidden;
            });

            if (updateUrl) {
                const url = new URL(window.location.href);

                if (activeCategory === 'all') {
                    url.searchParams.delete('category');
                } else {
                    url.searchParams.set('category', activeCategory);
                }

                window.history.replaceState({}, '', url);
            }
        }

        filterButtons.forEach(function(button) {
            button.addEventListener('click', function() {
                applyPostFilter(button.dataset.category, true);
            });
        });

        applyPostFilter(new URLSearchParams(window.location.search).get('category') || 'all', false);
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('bibtex-modal');
    const bibtexContent = document.getElementById('bibtex-content');
    const copyBtn = document.getElementById('copy-bibtex');
    const closeBtn = document.querySelector('.close-btn');

    if (!modal || !bibtexContent || !copyBtn || !closeBtn) {
        return;
    }

    function showModal(bibtexText) {
        bibtexContent.textContent = bibtexText;
        modal.classList.add('is-open');
        document.body.style.overflow = 'hidden';
    }

    function hideModal() {
        modal.classList.remove('is-open');
        document.body.style.overflow = '';
        copyBtn.classList.remove('copied');
        copyBtn.textContent = '复制到剪贴板';
    }

    async function copyToClipboard() {
        try {
            await navigator.clipboard.writeText(bibtexContent.textContent);
            copyBtn.classList.add('copied');
            copyBtn.textContent = '已复制';

            setTimeout(function() {
                copyBtn.classList.remove('copied');
                copyBtn.textContent = '复制到剪贴板';
            }, 2000);
        } catch (error) {
            copyBtn.textContent = '复制失败';
        }
    }

    document.querySelectorAll('a[href="#"]').forEach(function(link) {
        link.addEventListener('click', function(event) {
            const source = link.closest('[data-bibtex]');
            const bibtexData = source ? source.dataset.bibtex : '';

            if (bibtexData) {
                event.preventDefault();
                showModal(bibtexData);
            }
        });
    });

    closeBtn.addEventListener('click', hideModal);
    copyBtn.addEventListener('click', copyToClipboard);

    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            hideModal();
        }
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && modal.classList.contains('is-open')) {
            hideModal();
        }
    });
});
