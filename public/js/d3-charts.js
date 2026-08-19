/**
 * SocialNet D3.js Charts Library
 * Modern, responsive, interactive visualizations built with D3 v7.
 */

(function (global) {
    'use strict';

    // Tooltip singleton
    let tooltip = null;
    function getTooltip() {
        if (!tooltip) {
            tooltip = d3.select('body')
                .append('div')
                .attr('class', 'd3-chart-tooltip')
                .style('position', 'absolute')
                .style('visibility', 'hidden')
                .style('pointer-events', 'none')
                .style('z-index', '9999');
        }
        return tooltip;
    }

    const defaultColors = [
        '#6c8cff', // accent blue
        '#ff5b7f', // pink/rose
        '#22c55e', // vibrant green
        '#ff9a5b', // warm orange
        '#a855f7', // purple
        '#06b6d4', // cyan
        '#eab308'  // yellow
    ];

    /**
     * Renders an interactive Donut Chart
     */
    function renderDonutChart(containerSelector, data, options = {}) {
        const container = d3.select(containerSelector);
        if (container.empty()) return;
        container.html(''); // clear previous content

        const width = options.width || 320;
        const height = options.height || 260;
        const margin = options.margin || 16;
        const radius = Math.min(width, height) / 2 - margin;
        const innerRadius = options.innerRadius || radius * 0.62;

        const total = d3.sum(data, d => d.count || d.value || 0);

        if (total === 0) {
            container.append('div')
                .attr('class', 'chart-empty-state')
                .html('<p style="color:var(--muted);text-align:center;padding:40px 0;font-size:0.9rem">No posts yet to display.</p>');
            return;
        }

        // Only draw slices for items with value > 0 so zero-count slices do not leave empty gaps
        const activeData = data.filter(d => (d.count || d.value || 0) > 0);

        const colorScale = options.colors
            ? d3.scaleOrdinal().range(options.colors)
            : d3.scaleOrdinal().range(defaultColors);

        const svg = container.append('svg')
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('width', '100%')
            .attr('height', height)
            .style('overflow', 'visible')
            .append('g')
            .attr('transform', `translate(${width / 2}, ${height / 2})`);

        // If only 1 slice exists, padAngle must be 0 so it forms a complete 360-degree circle
        const padAngle = activeData.length > 1 ? (options.padAngle !== undefined ? options.padAngle : 0.02) : 0;

        const pie = d3.pie()
            .value(d => d.count || d.value || 0)
            .sort(null)
            .padAngle(padAngle);

        const arc = d3.arc()
            .innerRadius(innerRadius)
            .outerRadius(radius)
            .cornerRadius(activeData.length > 1 ? 3 : 0);

        const arcHover = d3.arc()
            .innerRadius(innerRadius)
            .outerRadius(radius + 7)
            .cornerRadius(activeData.length > 1 ? 3 : 0);

        const arcs = svg.selectAll('.arc')
            .data(pie(activeData))
            .enter()
            .append('g')
            .attr('class', 'arc');

        const tip = getTooltip();

        arcs.append('path')
            .attr('d', arc)
            .attr('fill', (d, i) => d.data.color || colorScale(d.data.label || d.data.type || i))
            .style('cursor', 'pointer')
            .style('transition', 'filter 0.2s')
            .on('mouseover', function (event, d) {
                d3.select(this)
                    .transition().duration(200)
                    .attr('d', arcHover)
                    .style('filter', 'brightness(1.2)');

                const name = d.data.label || d.data.type || 'Item';
                const count = d.data.count || d.data.value || 0;
                const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';

                tip.style('visibility', 'visible')
                    .html(`
                        <div style="font-weight:600;margin-bottom:2px">${name.toUpperCase()}</div>
                        <div style="font-size:0.85rem;color:var(--muted)">Count: <strong style="color:var(--text)">${count}</strong> (${pct}%)</div>
                    `);
            })
            .on('mousemove', function (event) {
                tip.style('top', (event.pageY - 38) + 'px')
                   .style('left', (event.pageX + 14) + 'px');
            })
            .on('mouseout', function () {
                d3.select(this)
                    .transition().duration(200)
                    .attr('d', arc)
                    .style('filter', 'none');
                tip.style('visibility', 'hidden');
            })
            .transition()
            .duration(800)
            .attrTween('d', function (d) {
                const interpolate = d3.interpolate({ startAngle: d.startAngle, endAngle: d.startAngle }, d);
                return function (t) {
                    return arc(interpolate(t));
                };
            });

        // Center total counter
        const centerGroup = svg.append('g').attr('class', 'center-text');
        centerGroup.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '-0.1em')
            .style('font-size', '1.6rem')
            .style('font-weight', '700')
            .style('fill', 'var(--text)')
            .text(total);

        centerGroup.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '1.3em')
            .style('font-size', '0.75rem')
            .style('letter-spacing', '0.5px')
            .style('text-transform', 'uppercase')
            .style('fill', 'var(--muted)')
            .text(options.centerLabel || 'Total');

        // Legend below chart if requested
        if (options.showLegend !== false) {
            const legend = container.append('div')
                .attr('class', 'd3-chart-legend')
                .style('display', 'flex')
                .style('flex-wrap', 'wrap')
                .style('justify-content', 'center')
                .style('gap', '12px')
                .style('margin-top', '12px');

            data.forEach((d, i) => {
                const color = d.color || colorScale(d.label || d.type || i);
                const name = d.label || d.type || 'Item';
                const count = d.count || d.value || 0;
                const pct = total > 0 ? ((count / total) * 100).toFixed(0) : 0;

                const item = legend.append('div')
                    .style('display', 'flex')
                    .style('align-items', 'center')
                    .style('font-size', '0.8rem')
                    .style('color', 'var(--muted)');

                item.append('span')
                    .style('width', '10px')
                    .style('height', '10px')
                    .style('border-radius', '50%')
                    .style('background-color', color)
                    .style('margin-right', '6px')
                    .style('display', 'inline-block');

                item.append('span')
                    .html(`<strong style="color:var(--text);text-transform:capitalize">${name}</strong> (${count} &middot; ${pct}%)`);
            });
        }
    }

    /**
     * Renders an interactive Vertical Bar Chart
     */
    function renderBarChart(containerSelector, data, options = {}) {
        const container = d3.select(containerSelector);
        if (container.empty()) return;
        container.html('');

        if (!data || data.length === 0) {
            container.append('div')
                .attr('class', 'chart-empty-state')
                .html('<p style="color:var(--muted);text-align:center;padding:40px 0;font-size:0.9rem">No data recorded yet.</p>');
            return;
        }

        const margin = { top: 25, right: 20, bottom: 45, left: 45 };
        const width = (options.width || 460) - margin.left - margin.right;
        const height = (options.height || 260) - margin.top - margin.bottom;

        const xKey = options.xKey || 'category';
        const yKey = options.yKey || 'groupCount';

        const svg = container.append('svg')
            .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
            .attr('width', '100%')
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left}, ${margin.top})`);

        // Scales
        const x = d3.scaleBand()
            .range([0, width])
            .domain(data.map(d => d[xKey]))
            .padding(0.35);

        const yMax = d3.max(data, d => d[yKey]) || 1;
        const y = d3.scaleLinear()
            .range([height, 0])
            .domain([0, yMax < 5 ? 5 : yMax * 1.15])
            .nice();

        // Horizontal Gridlines
        svg.append('g')
            .attr('class', 'grid')
            .call(
                d3.axisLeft(y)
                    .ticks(5)
                    .tickSize(-width)
                    .tickFormat('')
            )
            .style('stroke-dasharray', '3 3')
            .style('stroke-opacity', 0.2)
            .style('color', 'var(--divider)');

        // X Axis
        svg.append('g')
            .attr('transform', `translate(0, ${height})`)
            .call(d3.axisBottom(x))
            .selectAll('text')
            .style('font-size', '0.78rem')
            .style('fill', 'var(--muted)')
            .style('text-transform', 'capitalize')
            .attr('dy', '10px');

        // Y Axis
        svg.append('g')
            .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('d')))
            .selectAll('text')
            .style('font-size', '0.78rem')
            .style('fill', 'var(--muted)');

        // Remove axis domain lines
        svg.selectAll('.domain').style('stroke', 'var(--divider)');
        svg.selectAll('.tick line').style('stroke', 'var(--divider)');

        const tip = getTooltip();

        // Defs for Bar Gradient
        const defs = svg.append('defs');
        const gradient = defs.append('linearGradient')
            .attr('id', 'bar-gradient-' + Math.random().toString(36).substring(2, 7))
            .attr('x1', '0%').attr('y1', '0%')
            .attr('x2', '0%').attr('y2', '100%');

        gradient.append('stop').attr('offset', '0%').attr('stop-color', options.barColor || '#6c8cff');
        gradient.append('stop').attr('offset', '100%').attr('stop-color', options.barColorEnd || '#3b82f6');

        // Bars
        svg.selectAll('.bar')
            .data(data)
            .enter()
            .append('rect')
            .attr('class', 'bar')
            .attr('x', d => x(d[xKey]))
            .attr('width', x.bandwidth())
            .attr('y', height)
            .attr('height', 0)
            .attr('rx', 4)
            .attr('fill', `url(#${gradient.attr('id')})`)
            .style('cursor', 'pointer')
            .style('transition', 'filter 0.2s')
            .on('mouseover', function (event, d) {
                d3.select(this).style('filter', 'brightness(1.25)');
                const catName = d[xKey];
                const count = d[yKey];
                const extra = d.totalMembers !== undefined ? `<div style="font-size:0.8rem;color:var(--muted);margin-top:2px">Total Members: <strong style="color:var(--text)">${d.totalMembers}</strong></div>` : '';

                tip.style('visibility', 'visible')
                    .html(`
                        <div style="font-weight:600;text-transform:capitalize">${catName}</div>
                        <div style="font-size:0.85rem;color:var(--muted)">${options.yLabel || 'Count'}: <strong style="color:var(--text)">${count}</strong></div>
                        ${extra}
                    `);
            })
            .on('mousemove', function (event) {
                tip.style('top', (event.pageY - 40) + 'px')
                   .style('left', (event.pageX + 14) + 'px');
            })
            .on('mouseout', function () {
                d3.select(this).style('filter', 'none');
                tip.style('visibility', 'hidden');
            })
            .transition()
            .duration(800)
            .delay((d, i) => i * 60)
            .attr('y', d => y(d[yKey]))
            .attr('height', d => Math.max(0, height - y(d[yKey])));

        // Add numerical value on top of each bar
        svg.selectAll('.bar-label')
            .data(data)
            .enter()
            .append('text')
            .attr('class', 'bar-label')
            .attr('x', d => x(d[xKey]) + x.bandwidth() / 2)
            .attr('y', d => y(d[yKey]) - 6)
            .attr('text-anchor', 'middle')
            .style('font-size', '0.75rem')
            .style('font-weight', '600')
            .style('fill', 'var(--text)')
            .style('opacity', 0)
            .text(d => d[yKey])
            .transition()
            .duration(800)
            .delay((d, i) => i * 60 + 300)
            .style('opacity', 1);
    }

    /**
     * Renders an interactive Area/Timeline Line Chart
     */
    function renderTimelineChart(containerSelector, data, options = {}) {
        const container = d3.select(containerSelector);
        if (container.empty()) return;
        container.html('');

        if (!data || data.length === 0) {
            container.append('div')
                .attr('class', 'chart-empty-state')
                .html('<p style="color:var(--muted);text-align:center;padding:40px 0;font-size:0.9rem">No activity recorded yet.</p>');
            return;
        }

        const margin = { top: 20, right: 25, bottom: 40, left: 40 };
        const width = (options.width || 540) - margin.left - margin.right;
        const height = (options.height || 240) - margin.top - margin.bottom;

        const parseDate = d3.timeParse('%Y-%m-%d');
        const formattedData = data.map(d => ({
            date: typeof d.date === 'string' ? parseDate(d.date) || new Date(d.date) : d.date,
            count: Number(d.count || 0)
        })).sort((a, b) => a.date - b.date);

        const svg = container.append('svg')
            .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
            .attr('width', '100%')
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left}, ${margin.top})`);

        // Scales
        const x = d3.scaleTime()
            .domain(d3.extent(formattedData, d => d.date))
            .range([0, width]);

        const yMax = d3.max(formattedData, d => d.count) || 1;
        const y = d3.scaleLinear()
            .domain([0, yMax < 5 ? 5 : yMax * 1.2])
            .range([height, 0])
            .nice();

        // Gridlines
        svg.append('g')
            .attr('class', 'grid')
            .call(d3.axisLeft(y).ticks(4).tickSize(-width).tickFormat(''))
            .style('stroke-dasharray', '3 3')
            .style('stroke-opacity', 0.15)
            .style('color', 'var(--divider)');

        // X Axis
        svg.append('g')
            .attr('transform', `translate(0, ${height})`)
            .call(d3.axisBottom(x).ticks(Math.min(formattedData.length, 6)).tickFormat(d3.timeFormat('%d %b')))
            .selectAll('text')
            .style('font-size', '0.78rem')
            .style('fill', 'var(--muted)')
            .attr('dy', '10px');

        // Y Axis
        svg.append('g')
            .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('d')))
            .selectAll('text')
            .style('font-size', '0.78rem')
            .style('fill', 'var(--muted)');

        svg.selectAll('.domain').style('stroke', 'var(--divider)');
        svg.selectAll('.tick line').style('stroke', 'var(--divider)');

        // Gradient for Area fill
        const defs = svg.append('defs');
        const areaGrad = defs.append('linearGradient')
            .attr('id', 'timeline-area-grad-' + Math.random().toString(36).substring(2, 7))
            .attr('x1', '0%').attr('y1', '0%')
            .attr('x2', '0%').attr('y2', '100%');

        areaGrad.append('stop').attr('offset', '0%').attr('stop-color', '#ff5b7f').attr('stop-opacity', 0.4);
        areaGrad.append('stop').attr('offset', '100%').attr('stop-color', '#ff5b7f').attr('stop-opacity', 0.0);

        // Area Generator
        const area = d3.area()
            .x(d => x(d.date))
            .y0(height)
            .y1(d => y(d.count))
            .curve(d3.curveMonotoneX);

        // Line Generator
        const line = d3.line()
            .x(d => x(d.date))
            .y(d => y(d.count))
            .curve(d3.curveMonotoneX);

        // Draw Area
        svg.append('path')
            .datum(formattedData)
            .attr('fill', `url(#${areaGrad.attr('id')})`)
            .attr('d', area);

        // Draw Line
        const path = svg.append('path')
            .datum(formattedData)
            .attr('fill', 'none')
            .attr('stroke', '#ff5b7f')
            .attr('stroke-width', 2.5)
            .attr('d', line);

        // Animate line stroke
        const totalLength = path.node() ? path.node().getTotalLength() : 0;
        if (totalLength) {
            path.attr('stroke-dasharray', `${totalLength} ${totalLength}`)
                .attr('stroke-dashoffset', totalLength)
                .transition()
                .duration(1000)
                .ease(d3.easeCubicOut)
                .attr('stroke-dashoffset', 0);
        }

        const tip = getTooltip();

        // Dots on data points
        svg.selectAll('.dot')
            .data(formattedData)
            .enter()
            .append('circle')
            .attr('class', 'dot')
            .attr('cx', d => x(d.date))
            .attr('cy', d => y(d.count))
            .attr('r', 4.5)
            .attr('fill', '#16191d')
            .attr('stroke', '#ff5b7f')
            .attr('stroke-width', 2)
            .style('cursor', 'pointer')
            .style('transition', 'transform 0.2s, r 0.2s')
            .on('mouseover', function (event, d) {
                d3.select(this).attr('r', 7).attr('fill', '#ff5b7f');
                const dateStr = d3.timeFormat('%A, %b %d, %Y')(d.date);
                tip.style('visibility', 'visible')
                    .html(`
                        <div style="font-weight:600">${dateStr}</div>
                        <div style="font-size:0.85rem;color:var(--muted)">New Posts: <strong style="color:var(--text)">${d.count}</strong></div>
                    `);
            })
            .on('mousemove', function (event) {
                tip.style('top', (event.pageY - 40) + 'px')
                   .style('left', (event.pageX + 14) + 'px');
            })
            .on('mouseout', function () {
                d3.select(this).attr('r', 4.5).attr('fill', '#16191d');
                tip.style('visibility', 'hidden');
            });
    }

    /**
     * Renders a Horizontal Ranking Bar Chart (e.g. Top Contributors)
     */
    function renderHorizontalBarChart(containerSelector, data, options = {}) {
        const container = d3.select(containerSelector);
        if (container.empty()) return;
        container.html('');

        if (!data || data.length === 0) {
            container.append('div')
                .attr('class', 'chart-empty-state')
                .html('<p style="color:var(--muted);text-align:center;padding:30px 0;font-size:0.88rem">No posts yet in this group.</p>');
            return;
        }

        const margin = { top: 15, right: 35, bottom: 20, left: 110 };
        const width = (options.width || 380) - margin.left - margin.right;
        const barHeight = 28;
        const height = data.length * (barHeight + 12);

        const svg = container.append('svg')
            .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
            .attr('width', '100%')
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left}, ${margin.top})`);

        const xMax = d3.max(data, d => d.postCount || d.value || 0) || 1;
        const x = d3.scaleLinear()
            .domain([0, xMax < 5 ? 5 : xMax * 1.15])
            .range([0, width])
            .nice();

        const y = d3.scaleBand()
            .domain(data.map(d => d.fullName || d.username || d.label))
            .range([0, height])
            .padding(0.28);

        // Y Axis (User Names)
        svg.append('g')
            .call(d3.axisLeft(y).tickSize(0))
            .selectAll('text')
            .style('font-size', '0.82rem')
            .style('font-weight', '500')
            .style('fill', 'var(--text)')
            .style('text-anchor', 'end')
            .attr('dx', '-8px');

        svg.selectAll('.domain').remove();

        const tip = getTooltip();

        // Bars
        svg.selectAll('.hbar')
            .data(data)
            .enter()
            .append('rect')
            .attr('class', 'hbar')
            .attr('y', d => y(d.fullName || d.username || d.label))
            .attr('height', y.bandwidth())
            .attr('x', 0)
            .attr('width', 0)
            .attr('rx', 4)
            .attr('fill', options.color || '#22c55e')
            .style('cursor', 'pointer')
            .style('transition', 'filter 0.2s')
            .on('mouseover', function (event, d) {
                d3.select(this).style('filter', 'brightness(1.2)');
                const handle = d.username ? ` (@${d.username})` : '';
                tip.style('visibility', 'visible')
                    .html(`
                        <div style="font-weight:600">${(d.fullName || d.username || d.label)}${handle}</div>
                        <div style="font-size:0.85rem;color:var(--muted)">Posts: <strong style="color:var(--text)">${d.postCount || d.value}</strong></div>
                    `);
            })
            .on('mousemove', function (event) {
                tip.style('top', (event.pageY - 40) + 'px')
                   .style('left', (event.pageX + 14) + 'px');
            })
            .on('mouseout', function () {
                d3.select(this).style('filter', 'none');
                tip.style('visibility', 'hidden');
            })
            .transition()
            .duration(700)
            .delay((d, i) => i * 80)
            .attr('width', d => Math.max(4, x(d.postCount || d.value || 0)));

        // Value text at the end of each bar
        svg.selectAll('.hbar-val')
            .data(data)
            .enter()
            .append('text')
            .attr('class', 'hbar-val')
            .attr('y', d => y(d.fullName || d.username || d.label) + y.bandwidth() / 2 + 4)
            .attr('x', d => x(d.postCount || d.value || 0) + 8)
            .style('font-size', '0.78rem')
            .style('font-weight', '600')
            .style('fill', 'var(--muted)')
            .text(d => d.postCount || d.value || 0);
    }

    // Expose library methods globally
    global.SocialNetCharts = {
        renderDonutChart,
        renderBarChart,
        renderTimelineChart,
        renderHorizontalBarChart
    };

})(window);
