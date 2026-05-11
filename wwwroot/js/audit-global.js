const AuditUI = (function () {
    window.AuditUI = (function () {

        const ignoreFields = ['Password', 'Jwtoken'];

        // store last config so pagination buttons can re-call load()
        let lastConfig = {};

        function load(options) {

            let config = {
                url: '/CMS/GetAuditHistory',
                entityName: '',
                page: 1,
                pageSize: 10,
                container: '#audit-modal-container'
            };

            config = { ...config, ...options };
            lastConfig = config;

            // show loading state
            $(config.container).html('<div style="padding:10px;">Loading audit history...</div>');
            $('.audit-pagination-container').html('');

            $.ajax({
                url: config.url,
                type: 'GET',
                data: {
                    entityName: config.entityName,
                    page: config.page,
                    pageSize: config.pageSize
                },
                success: function (res) {

                    if (!res || !res.success) {
                        console.error(res?.message || "Audit load failed");
                        $(config.container).html('<div class="audit-empty">Failed to load audit</div>');
                        $('.audit-pagination-container').html('');
                        return;
                    }

                    // res.data maps to AuditHistoryResponse:
                    //   res.data.records      – array of audit records
                    //   res.data.page         – current page number
                    //   res.data.totalPages   – total page count
                    render(
                        res.data.records,
                        config.container,
                        res.data.page,        // ← was wrongly res.data.currentPage
                        res.data.totalPages
                    );
                },
                error: function (err) {
                    console.error("Audit fetch failed", err);
                    $(config.container).html('<div class="audit-empty">Error loading audit</div>');
                    $('.audit-pagination-container').html('');
                }
            });
        }

    function render(records, container, currentPage, totalPages) {

        currentPage  = parseInt(currentPage)  || 1;
        totalPages   = parseInt(totalPages)   || 1;

        // ── Content ──────────────────────────────────────────────
        if (!records || records.length === 0) {
            $(container).html('<div class="audit-empty">No audit records found.</div>');
            renderPagination(currentPage, totalPages);
            return;
        }

        let contentHtml = '';

        records.forEach(item => {

            let oldObj = parse(item.oldValues);
            let newObj = parse(item.newValues);
            const actionClass = getActionClass(item.actionType);

            contentHtml += `
                <div class="audit-card ${actionClass}">
                    <div class="audit-header">
                        <div>
                            <span class="badge ${actionClass}">
                                ${item.actionType || ''}
                            </span>
                            <strong>${item.changedBy || ''}</strong>
                        </div>
                        <span class="audit-date">${formatDate(item.changedAt)}</span>
                    </div>
                    <div class="audit-body">
                        ${diff(oldObj, newObj)}
                    </div>
                </div>
            `;
        });

        $(container).html(contentHtml);

        // ── Pagination (always rendered, even on single page) ────
        renderPagination(currentPage, totalPages);
    }

    function renderPagination(currentPage, totalPages) {

        // always clear first so stale buttons never stay
        if (totalPages <= 1) {
            $('.audit-pagination-container').html('');
            return;
        }

        let paginationHtml = '<div class="audit-pagination">';

        // Prev button
        paginationHtml += `
            <button class="audit-page-btn ${currentPage === 1 ? 'disabled' : ''}"
                    data-page="${currentPage - 1}"
                    ${currentPage === 1 ? 'disabled' : ''}>
                &#8249; Prev
            </button>`;

        // Page number buttons (show max 5 around current)
        const range = 2;
        const start = Math.max(1, currentPage - range);
        const end   = Math.min(totalPages, currentPage + range);

        if (start > 1) {
            paginationHtml += `<button class="audit-page-btn" data-page="1">1</button>`;
            if (start > 2) paginationHtml += `<span class="audit-page-ellipsis">…</span>`;
        }

        for (let i = start; i <= end; i++) {
            paginationHtml += `
                <button class="audit-page-btn ${i === currentPage ? 'active' : ''}"
                        data-page="${i}"
                        ${i === currentPage ? 'disabled' : ''}>
                    ${i}
                </button>`;
        }

        if (end < totalPages) {
            if (end < totalPages - 1) paginationHtml += `<span class="audit-page-ellipsis">…</span>`;
            paginationHtml += `<button class="audit-page-btn" data-page="${totalPages}">${totalPages}</button>`;
        }

        // Next button
        paginationHtml += `
            <button class="audit-page-btn ${currentPage === totalPages ? 'disabled' : ''}"
                    data-page="${currentPage + 1}"
                    ${currentPage === totalPages ? 'disabled' : ''}>
                Next &#8250;
            </button>`;

        paginationHtml += `
            <span class="audit-page-info">Page ${currentPage} of ${totalPages}</span>
        </div>`;

        $('.audit-pagination-container').html(paginationHtml);
    }

    function diff(oldObj, newObj) {

        let html = `
        <table class="audit-table">
            <thead>
                <tr>
                    <th>Field</th>
                    <th>Before</th>
                    <th>After</th>
                </tr>
            </thead>
            <tbody>
        `;

        const keys = Object.keys(newObj || {});

        keys.forEach(key => {

            if (ignoreFields.includes(key)) return;

            let oldVal = oldObj ? oldObj[key] : null;
            let newVal = newObj[key];

            if (oldVal !== newVal) {
                html += `
                    <tr>
                        <td class="field">${key}</td>
                        <td class="old">${formatValue(oldVal)}</td>
                        <td class="new">${formatValue(newVal)}</td>
                    </tr>
                `;
            }
        });

        html += `</tbody></table>`;
        return html;
    }

    function parse(json) {
        try {
            return JSON.parse(json);
        } catch {
            return {};
        }
    }

    function getActionClass(action) {
        if (!action) return '';

        action = action.toLowerCase();

        if (['create', 'insert', 'add'].includes(action)) return 'create';
        if (['update', 'edit', 'modify'].includes(action)) return 'update';
        if (['delete', 'remove'].includes(action)) return 'delete';

        return '';
    }

    function formatValue(val) {
        if (val === null || val === undefined) return '<i>null</i>';

        let str = val.toString();
        return str.length > 80 ? str.substring(0, 80) + '...' : str;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleString();
    }

    // ── Pagination click (server-side fetch) ─────────────────────
    $(document).off('click.auditPage')
        .on('click.auditPage', '.audit-page-btn', function () {

            if ($(this).hasClass('disabled') || $(this).prop('disabled')) return;

            const page = parseInt($(this).data('page'));
            if (!page || isNaN(page)) return;

            load({ ...lastConfig, page: page });
        });

    // ── Page-size selector ────────────────────────────────────────
    $(document).off('change.auditSize')
        .on('change.auditSize', '#audit-page-size', function () {

            const newSize = parseInt($(this).val());
            if (!newSize) return;

            load({ ...lastConfig, page: 1, pageSize: newSize });
        });

    return { load, render };

})();