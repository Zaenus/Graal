document.getElementById('filter-btn').addEventListener('click', async function() {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const unidade = document.getElementById('database').value;

    const reportTable = document.getElementById('report-table');
    const qrCodesTable = document.getElementById('qr-codes-table');
    const rescuedProductsTable = document.getElementById('rescued-products-table');

    reportTable.style.display = unidade === 'restaurante' || unidade === 'posto' ? 'table' : 'none';
    qrCodesTable.style.display = unidade === 'banhos' ? 'table' : 'none';
    rescuedProductsTable.style.display = unidade === 'rescued-products' ? 'table' : 'none';

    let url = '';
    if (unidade === 'restaurante') {
        url = `/get-worked-hours?startDate=${startDate}&endDate=${endDate}`;
    } else if (unidade === 'posto') {
        url = `/get-worked-hours-posto?startDate=${startDate}&endDate=${endDate}`;
    } else if (unidade === 'banhos') {
        url = `/used-qr-codes?startDate=${startDate}&endDate=${endDate}`;
    } else if (unidade === 'rescued-products') {
        url = `/api/rescue-report?startDate=${startDate}&endDate=${endDate}`;
    }

    try {
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        console.log(`${unidade} data:`, data);

        if (unidade === 'banhos') {
            const qrTableBody = qrCodesTable.getElementsByTagName('tbody')[0];
            qrTableBody.innerHTML = '';
            if (!data || data.length === 0) {
                const tr = document.createElement('tr');
                tr.innerHTML = '<td colspan="4">Nenhum dado encontrado</td>';
                qrTableBody.appendChild(tr);
            } else {
                let itemCount = 0; // Add counter for items
                data.forEach(row => {
                    const tr = document.createElement('tr');
                    const formattedDate = formatTimestamp(row.expiration_time || 'N/A'); // Use new function
                    itemCount++; // Increment item count for each row
                    tr.innerHTML = `
                        <td>${formattedDate}</td>
                        <td>${row.enterprise_name || 'N/A'}</td>
                        <td>${row.conductor_name || 'N/A'}</td>
                        <td>${row.plate || 'N/A'}</td>
                    `;
                    qrTableBody.appendChild(tr);
                });
                const totalTr = document.createElement('tr');
                totalTr.innerHTML = `
                    <td colspan="2"><strong>Total:</strong></td>
                    <td><strong>(${itemCount} itens)</strong></td>
                    <td colspan="2"></td>
                `;
                qrTableBody.appendChild(totalTr);
            }
        } else if (unidade === 'rescued-products') {
            const rescuedTableBody = rescuedProductsTable.getElementsByTagName('tbody')[0];
            rescuedTableBody.innerHTML = '';
            if (!data || data.length === 0) {
                const tr = document.createElement('tr');
                tr.innerHTML = '<td colspan="4">Nenhum dado encontrado</td>';
                rescuedTableBody.appendChild(tr);
            } else {
                let itemCount = 0; // Add counter for items
                data.forEach(row => {
                    const tr = document.createElement('tr');
                    const formattedDate = newFormatDate(row.rescue_date || 'N/A');
                    itemCount++; // Increment item count for each row
                    tr.innerHTML = `
                        <td>${formattedDate}</td>
                        <td>${row.product_name || 'N/A'}</td>
                        <td>${row.rescued_by || 'N/A'}</td>
                        <td>${row.rescue_cpf || 'N/A'}</td>
                    `;
                    rescuedTableBody.appendChild(tr);
                });
                const totalTr = document.createElement('tr');
                totalTr.innerHTML = `
                    <td colspan="2"><strong>Total:</strong></td>
                    <td><strong>(${itemCount} itens)</strong></td>
                    <td colspan="2"></td>
                `;
                rescuedTableBody.appendChild(totalTr);
            }
        } else {
            const tableBody = reportTable.getElementsByTagName('tbody')[0];
            tableBody.innerHTML = '';
            if (!data || data.length === 0) {
                const tr = document.createElement('tr');
                tr.innerHTML = '<td colspan="5">Nenhum dado encontrado</td>';
                tableBody.appendChild(tr);
            } else {
                let totalValue = 0;
                let itemCount = 0; // Add counter for items
                data.forEach(row => {
                    const tr = document.createElement('tr');
                    const formattedDate = formatDate(row.date || 'N/A');
                    totalValue += parseFloat(row.value || 0);
                    itemCount++; // Increment item count for each row
                    tr.innerHTML = `
                        <td>${formattedDate}</td>
                        <td>${row.employer_name || 'N/A'}</td>
                        <td>${row.value || '0'}</td>
                        <td>${row.manager || 'N/A'}</td>
                        <td>${row.motive || 'N/A'}</td>
                    `;
                    tableBody.appendChild(tr);
                });
                const totalTr = document.createElement('tr');
                totalTr.innerHTML = `
                    <td colspan="2"><strong>Total:</strong></td>
                    <td><strong>${totalValue.toFixed(2).replace('.', ',')} (${itemCount} itens)</strong></td>
                    <td colspan="2"></td>
                `;
                tableBody.appendChild(totalTr);
            }
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        const tableBody = unidade === 'banhos' ? qrCodesTable.getElementsByTagName('tbody')[0] :
                         unidade === 'rescued-products' ? rescuedProductsTable.getElementsByTagName('tbody')[0] :
                         reportTable.getElementsByTagName('tbody')[0];
        tableBody.innerHTML = `<tr><td colspan="${unidade === 'banhos' ? 4 : 5}">Erro ao carregar dados: ${error.message}</td></tr>`;
    }
});

// Keep the original formatDate for other reports
function formatDate(dateString) {
    if (!dateString || dateString === 'N/A') return 'N/A';
    const [year, month, day] = dateString.split('-');
    const date = new Date(year, month - 1, day);
    const formattedDay = String(date.getDate()).padStart(2, '0');
    const formattedMonth = String(date.getMonth() + 1).padStart(2, '0');
    const formattedYear = date.getFullYear();
    return `${formattedDay}/${formattedMonth}/${formattedYear}`;
}

// New function for "banhos" report
function formatTimestamp(dateString) {
    if (!dateString || dateString === 'N/A') return 'N/A';
    
    // Handle various timestamp formats (e.g., "2025-03-04 12:00:00" or "2025-03-04T12:00:00Z")
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A'; // Return 'N/A' if invalid
    
    const formattedDay = String(date.getDate()).padStart(2, '0');
    const formattedMonth = String(date.getMonth() + 1).padStart(2, '0');
    const formattedYear = date.getFullYear();
    return `${formattedDay}/${formattedMonth}/${formattedYear}`;
}

// Modified function to show only date for rescued-products
function newFormatDate(dateString) {
    if (!dateString || dateString === 'N/A') return 'N/A';
    const [datePart] = dateString.split(' '); // Split off the time portion
    const [year, month, day] = datePart.split('-');
    const date = new Date(year, month - 1, day);
    const formattedDay = String(date.getDate()).padStart(2, '0');
    const formattedMonth = String(date.getMonth() + 1).padStart(2, '0');
    const formattedYear = date.getFullYear();
    return `${formattedDay}/${formattedMonth}/${formattedYear}`;
}

// Export logic remains unchanged
document.getElementById('export-btn').addEventListener('click', function() {
    const unidade = document.getElementById('database').value;
    let table, fileName;

    if (unidade === 'banhos') {
        table = document.getElementById('qr-codes-table');
        fileName = 'Banhos_Report.xlsx';
    } else if (unidade === 'rescued-products') {
        table = document.getElementById('rescued-products-table');
        fileName = 'Rescued_Products_Report.xlsx';
    } else {
        table = document.getElementById('report-table');
        fileName = unidade === 'restaurante' ? 'Restaurante_Report.xlsx' : 'Posto_Report.xlsx';
    }

    const wb = XLSX.utils.table_to_book(table, { sheet: "Report" });
    XLSX.writeFile(wb, fileName);
});
