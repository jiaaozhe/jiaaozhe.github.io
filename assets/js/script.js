document.addEventListener('DOMContentLoaded', function() {
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.getElementById('site-menu');
    const themeToggle = document.querySelector('.theme-toggle');
    const filterRoot = document.querySelector('[data-post-filter]');
    const postCards = Array.from(document.querySelectorAll('[data-post-categories]'));
    const fragmentFilterRoot = document.querySelector('[data-fragment-filter]');
    const fragmentItems = Array.from(document.querySelectorAll('[data-fragment-item]'));

    function toggleTheme() {
        const root = document.documentElement;
        const current = root.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

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

    if (fragmentFilterRoot && fragmentItems.length) {
        const fragmentButtons = Array.from(fragmentFilterRoot.querySelectorAll('[data-fragment-type]'));

        function applyFragmentFilter(type, updateUrl) {
            const activeType = fragmentButtons.some(function(button) {
                return button.dataset.fragmentType === type;
            }) ? type : 'all';

            fragmentButtons.forEach(function(button) {
                const isActive = button.dataset.fragmentType === activeType;
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-pressed', String(isActive));
            });

            fragmentItems.forEach(function(item) {
                const isHidden = activeType !== 'all' && item.dataset.fragmentType !== activeType;
                item.hidden = isHidden;
            });

            if (updateUrl) {
                const url = new URL(window.location.href);

                if (activeType === 'all') {
                    url.searchParams.delete('type');
                } else {
                    url.searchParams.set('type', activeType);
                }

                window.history.replaceState({}, '', url);
            }
        }

        fragmentButtons.forEach(function(button) {
            button.addEventListener('click', function() {
                applyFragmentFilter(button.dataset.fragmentType, true);
            });
        });

        const params = new URLSearchParams(window.location.search);
        applyFragmentFilter(params.get('type') || 'all', false);
    }

    // Timeline filter
    var timelineFilterRoot = document.querySelector('[data-timeline-filter]');
    var timeline = document.querySelector('[data-timeline]');

    if (timelineFilterRoot && timeline) {
        var timelineFilterButtons = Array.from(timelineFilterRoot.querySelectorAll('[data-filter]'));
        var timelineItems = Array.from(timeline.querySelectorAll('[data-timeline-kind]'));

        timelineItems.sort(function(a, b) {
            return b.dataset.timelineDate.localeCompare(a.dataset.timelineDate);
        });
        timelineItems.forEach(function(item) {
            timeline.appendChild(item);
        });

        function applyTimelineFilter(type) {
            var activeType = timelineFilterButtons.some(function(b) {
                return b.dataset.filter === type;
            }) ? type : 'all';

            timelineFilterButtons.forEach(function(button) {
                var isActive = button.dataset.filter === activeType;
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-pressed', String(isActive));
            });

            var visibleCount = 0;
            timelineItems.forEach(function(item) {
                var isMatch = activeType === 'all' || item.dataset.timelineKind === activeType;
                var shouldShow = isMatch && visibleCount < 12;
                item.hidden = !shouldShow;
                if (isMatch) visibleCount++;
            });
        }

        timelineFilterButtons.forEach(function(button) {
            button.addEventListener('click', function() {
                applyTimelineFilter(button.dataset.filter);
            });
        });

        applyTimelineFilter('all');
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
