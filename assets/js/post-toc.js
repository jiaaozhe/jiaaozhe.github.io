document.addEventListener('DOMContentLoaded', function() {
    const post = document.querySelector('[data-post]');
    const content = post ? post.querySelector('.post-content') : null;
    const toc = post ? post.querySelector('[data-post-toc]') : null;
    const tocNav = post ? post.querySelector('[data-post-toc-nav]') : null;

    if (!post || !content || !toc || !tocNav) {
        return;
    }

    const headings = Array.from(content.querySelectorAll('h2, h3')).filter(function(heading) {
        return heading.textContent.trim();
    });

    if (headings.length < 5) {
        return;
    }

    function slugify(text) {
        return text.trim()
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s-]/gu, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '') || 'section';
    }

    function uniqueId(base, usedIds) {
        let id = base;
        let index = 2;

        while (document.getElementById(id) || usedIds.has(id)) {
            id = base + '-' + index;
            index += 1;
        }

        usedIds.add(id);
        return id;
    }

    const usedIds = new Set();
    const links = [];

    headings.forEach(function(heading) {
        if (!heading.id) {
            heading.id = uniqueId(slugify(heading.textContent), usedIds);
        }

        const link = document.createElement('a');
        link.href = '#' + heading.id;
        link.textContent = heading.textContent.trim();
        link.className = 'post-toc-link post-toc-link-' + heading.tagName.toLowerCase();
        link.dataset.tocTarget = heading.id;
        tocNav.appendChild(link);
        links.push(link);
    });

    toc.hidden = false;
    post.classList.add('has-toc');

    function setActive(id) {
        links.forEach(function(link) {
            link.classList.toggle('is-active', link.dataset.tocTarget === id);
        });
    }

    if ('IntersectionObserver' in window) {
        const visibleHeadings = new Map();
        const observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    visibleHeadings.set(entry.target.id, entry.boundingClientRect.top);
                } else {
                    visibleHeadings.delete(entry.target.id);
                }
            });

            const active = Array.from(visibleHeadings.entries()).sort(function(a, b) {
                return a[1] - b[1];
            })[0];

            if (active) {
                setActive(active[0]);
            }
        }, {
            rootMargin: '-18% 0px -68% 0px',
            threshold: [0, 1]
        });

        headings.forEach(function(heading) {
            observer.observe(heading);
        });
    } else {
        setActive(headings[0].id);
    }
});
