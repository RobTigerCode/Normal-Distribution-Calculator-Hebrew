/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'motion/react';
import { InlineMath, BlockMath } from 'react-katex';
import { Info, Calculator, RefreshCw, HelpCircle } from 'lucide-react';

// --- Math Utilities ---

/**
 * Standard Normal Cumulative Distribution Function (CDF)
 * Approximation using the error function (erf)
 */
function normalCDF(x: number, mean: number, stdDev: number): number {
  const z = (x - mean) / stdDev;
  return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

/**
 * Error function approximation
 */
function erf(x: number): number {
  // constants
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  // Save the sign of x
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  // A&S formula 7.1.26
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

/**
 * Normal Probability Density Function (PDF)
 */
function normalPDF(x: number, mean: number, stdDev: number): number {
  const exponent = -Math.pow(x - mean, 2) / (2 * Math.pow(stdDev, 2));
  return (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(exponent);
}

// --- Types ---

type CalcType = 'below' | 'above' | 'between' | 'outside' | 'conditional';
type CondType = 'below' | 'above' | 'between';

interface CalculationResult {
  probability: number;
  z1: number;
  z2?: number;
  steps: string[];
}

// --- Components ---

const NormalChart: React.FC<{
  mean: number;
  stdDev: number;
  type: CalcType;
  x1: number;
  x2: number;
  condType?: CondType;
  condX1?: number;
  condX2?: number;
}> = ({ mean, stdDev, type, x1, x2, condType, condX1, condX2 }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const margin = { top: 40, right: 30, bottom: 80, left: 40 };
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Range for X axis (mean +/- 4 stdDev)
    const xMin = mean - 4 * stdDev;
    const xMax = mean + 4 * stdDev;

    const xScale = d3.scaleLinear()
      .domain([xMin, xMax])
      .range([0, width]);

    // Max height of the curve
    const yMax = normalPDF(mean, mean, stdDev);
    const yScale = d3.scaleLinear()
      .domain([0, yMax * 1.1])
      .range([height, 0]);

    // Generate data points for the curve
    const points: [number, number][] = [];
    const stepSize = (xMax - xMin) / 200;
    for (let x = xMin; x <= xMax; x += stepSize) {
      points.push([x, normalPDF(x, mean, stdDev)]);
    }

    const line = d3.line<[number, number]>()
      .x(d => xScale(d[0]))
      .y(d => yScale(d[1]))
      .curve(d3.curveBasis);

    // Shading logic
    const area = d3.area<[number, number]>()
      .x(d => xScale(d[0]))
      .y0(height)
      .y1(d => yScale(d[1]))
      .curve(d3.curveBasis);

    const getShadedPoints = () => {
      switch (type) {
        case 'below':
          return points.filter(p => p[0] <= x1);
        case 'above':
          return points.filter(p => p[0] >= x1);
        case 'between':
          const start = Math.min(x1, x2);
          const end = Math.max(x1, x2);
          return points.filter(p => p[0] >= start && p[0] <= end);
        case 'outside':
          const s = Math.min(x1, x2);
          const e = Math.max(x1, x2);
          return [points.filter(p => p[0] <= s), points.filter(p => p[0] >= e)];
        case 'conditional':
          if (!condType || condX1 === undefined) return points.filter(p => p[0] <= x1);
          
          const getRange = (t: string, v1: number, v2: number): [number, number] => {
            if (t === 'below') return [-Infinity, v1];
            if (t === 'above') return [v1, Infinity];
            return [Math.min(v1, v2), Math.max(v1, v2)];
          };

          const rangeA = getRange('below', x1, x2); 
          const rangeB = getRange(condType, condX1, condX2);

          const intersectStart = Math.max(rangeA[0], rangeB[0]);
          const intersectEnd = Math.min(rangeA[1], rangeB[1]);

          return points.filter(p => p[0] >= intersectStart && p[0] <= intersectEnd);
      }
    };

    const shaded = getShadedPoints();

    if (Array.isArray(shaded[0]) && Array.isArray(shaded[0][0])) {
      // Outside case (two areas)
      (shaded as [number, number][][]).forEach(pts => {
        g.append('path')
          .datum(pts)
          .attr('fill', 'rgba(59, 130, 246, 0.3)')
          .attr('d', area);
      });
    } else if (shaded.length > 0) {
      g.append('path')
        .datum(shaded as [number, number][])
        .attr('fill', 'rgba(59, 130, 246, 0.3)')
        .attr('d', area);
    }

    // Calculate and display percentage
    let probability = 0;
    if (type === 'below') {
      probability = normalCDF(x1, mean, stdDev);
    } else if (type === 'above') {
      probability = 1 - normalCDF(x1, mean, stdDev);
    } else if (type === 'between') {
      probability = Math.abs(normalCDF(x2, mean, stdDev) - normalCDF(x1, mean, stdDev));
    } else if (type === 'outside') {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      probability = normalCDF(minX, mean, stdDev) + (1 - normalCDF(maxX, mean, stdDev));
    } else if (type === 'conditional' && condType && condX1 !== undefined) {
      const getProb = (t: string, v1: number, v2: number) => {
        if (t === 'below') return normalCDF(v1, mean, stdDev);
        if (t === 'above') return 1 - normalCDF(v1, mean, stdDev);
        if (t === 'between') return Math.abs(normalCDF(v2, mean, stdDev) - normalCDF(v1, mean, stdDev));
        return 0;
      };

      const probB = getProb(condType, condX1, condX2 || 0);
      
      const getRange = (t: string, v1: number, v2: number): [number, number] => {
        if (t === 'below') return [-Infinity, v1];
        if (t === 'above') return [v1, Infinity];
        return [Math.min(v1, v2), Math.max(v1, v2)];
      };

      const rangeA = getRange('below', x1, x2); 
      const rangeB = getRange(condType, condX1, condX2 || 0);

      const intersectStart = Math.max(rangeA[0], rangeB[0]);
      const intersectEnd = Math.min(rangeA[1], rangeB[1]);

      let probAandB = 0;
      if (intersectStart < intersectEnd) {
        const pStart = intersectStart === -Infinity ? 0 : normalCDF(intersectStart, mean, stdDev);
        const pEnd = intersectEnd === Infinity ? 1 : normalCDF(intersectEnd, mean, stdDev);
        probAandB = pEnd - pStart;
      }

      probability = probB > 0 ? probAandB / probB : 0;
    }

    g.append('text')
      .attr('x', width / 2)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .attr('font-size', '16px')
      .attr('font-family', 'Assistant, sans-serif')
      .attr('font-weight', '800')
      .attr('fill', '#2563eb')
      .text(type === 'conditional' ? `P(A|B) = ${probability.toFixed(4)}` : `השטח הצבוע: ${(probability * 100).toFixed(2)}%`);

    // Draw the curve
    g.append('path')
      .datum(points)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 2)
      .attr('d', line);

    // Axes
    const xAxis = g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(7));
    
    xAxis.selectAll('text')
      .attr('font-family', 'Assistant, sans-serif')
      .attr('font-size', '12px')
      .attr('fill', '#64748b');
    
    xAxis.selectAll('line')
      .attr('stroke', '#e2e8f0');
    
    xAxis.select('.domain')
      .attr('stroke', '#e2e8f0');

    // Vertical lines for X values
    const drawXLine = (val: number, color: string, label: string, yOffset: number = 25) => {
      if (val < xMin || val > xMax) return;
      g.append('line')
        .attr('x1', xScale(val))
        .attr('x2', xScale(val))
        .attr('y1', yScale(0))
        .attr('y2', yScale(normalPDF(val, mean, stdDev)))
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,4');
      
      g.append('text')
        .attr('x', xScale(val))
        .attr('y', height + yOffset)
        .attr('text-anchor', 'middle')
        .attr('font-size', '14px')
        .attr('font-family', 'Assistant, sans-serif')
        .attr('font-weight', '700')
        .attr('fill', color)
        .text(label);
    };

    // Always draw mean line
    drawXLine(mean, '#64748b', `μ=${mean.toFixed(2)}`, 25);

    if (type === 'conditional') {
      drawXLine(x1, '#ef4444', `A: X<${x1.toFixed(2)}`, 45);
      drawXLine(condX1, '#10b981', `B: ${condType === 'below' ? 'X<' : 'X>'}${condX1.toFixed(2)}`, 25);
      if (condType === 'between' && condX2 !== undefined) {
        drawXLine(condX2, '#10b981', `B: X<${condX2.toFixed(2)}`, 65);
      }
    } else {
      // Draw input X values with potential offset to avoid overlap
      const x1Offset = Math.abs(x1 - mean) < (xMax - xMin) * 0.1 ? 45 : 25;
      drawXLine(x1, '#ef4444', `X=${x1.toFixed(2)}`, x1Offset);

      if (type === 'between' || type === 'outside') {
        let x2Offset = 25;
        const distToMean = Math.abs(x2 - mean);
        const distToX1 = Math.abs(x2 - x1);
        const threshold = (xMax - xMin) * 0.1;

        if (distToMean < threshold) {
          x2Offset = 45;
        } else if (distToX1 < threshold) {
          x2Offset = x1Offset === 25 ? 45 : 25;
        }
        
        drawXLine(x2, '#10b981', `X=${x2.toFixed(2)}`, x2Offset);
      }
    }

  }, [mean, stdDev, type, x1, x2]);

  return (
    <div className="w-full bg-white rounded-xl p-4 shadow-sm border border-slate-100 overflow-hidden">
      <svg ref={svgRef} className="w-full h-[400px]" />
    </div>
  );
};

const FormattedStep: React.FC<{ text: string }> = ({ text }) => {
  const isResult = text.startsWith('תוצאה סופית:');
  
  // Split by [MATH]...[/MATH]
  const parts = text.split(/\[MATH\](.*?)\[\/MATH\]/g);

  return (
    <div className={`text-slate-700 leading-relaxed font-sans text-sm md:text-base ${isResult ? 'font-bold text-blue-800 bg-blue-50/50 p-3 rounded-xl border border-blue-100 shadow-sm' : ''}`}>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          return <span key={i} dir="ltr" className="inline-block mx-1"><InlineMath math={part} /></span>;
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
};

const ZTable: React.FC<{ activeZ: number | null }> = ({ activeZ }) => {
  if (activeZ === null) return null;

  // We look up the absolute value for the table (standard positive Z-table)
  const lookupZ = Math.abs(activeZ);
  const rowVal = Math.floor(lookupZ * 10) / 10;
  const colVal = Math.round((lookupZ - rowVal) * 100) / 100;

  // Table range: 0.0 to 3.0 rows, 0.00 to 0.09 cols
  const rows = Array.from({ length: 31 }, (_, i) => i / 10);
  const cols = Array.from({ length: 10 }, (_, i) => i / 100);

  return (
    <div className="mt-6 overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">טבלת התפלגות נורמלית סטנדרטית (Z)</h3>
        <div className="text-xs text-slate-500">ערכי <InlineMath math="\Phi(z)" /> עבור <InlineMath math="z \ge 0" /></div>
      </div>
      <table className="w-full text-[10px] md:text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50">
            <th className="p-1 border border-slate-100 text-blue-600 font-bold">Z</th>
            {cols.map(c => <th key={c} className="p-1 border border-slate-100 text-slate-500">{c.toFixed(2).slice(2)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r} className={r === rowVal ? 'bg-blue-50/30' : ''}>
              <td className="p-1 border border-slate-100 font-bold text-slate-600 bg-slate-50/50">{r.toFixed(1)}</td>
              {cols.map(c => {
                const z = r + c;
                const val = normalCDF(z, 0, 1);
                const isActive = r === rowVal && Math.abs(c - colVal) < 0.001;
                return (
                  <td 
                    key={c} 
                    className={`p-1 border border-slate-100 text-center transition-all ${
                      isActive 
                        ? 'bg-blue-600 text-white font-bold scale-110 shadow-sm z-10 relative' 
                        : 'text-slate-500'
                    }`}
                  >
                    {val.toFixed(4)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-2 bg-blue-50/50 text-[10px] text-blue-700 text-center">
        נחפש את הערך עבור <InlineMath math={`|Z| = ${lookupZ.toFixed(2)}`} /> (שורה {rowVal.toFixed(1)}, עמודה {colVal.toFixed(2).slice(2)})
      </div>
    </div>
  );
};

export default function NormalDistributionCalculator() {
  const [mean, setMean] = useState<number>(0);
  const [stdDev, setStdDev] = useState<number>(1);
  const [type, setType] = useState<CalcType>('below');
  const [x1, setX1] = useState<number>(0);
  const [x2, setX2] = useState<number>(1);
  const [condType, setCondType] = useState<CondType>('above');
  const [condX1, setCondX1] = useState<number>(0);
  const [condX2, setCondX2] = useState<number>(1);

  const result = useMemo((): CalculationResult => {
    const z1 = (x1 - mean) / stdDev;
    const z2 = (x2 - mean) / stdDev;
    let prob = 0;
    const steps: string[] = [];

    steps.push(`נתונים: [MATH]\\mu = ${mean}, \\sigma = ${stdDev}[/MATH]`);

    if (type === 'conditional') {
      // P(A | B) = P(A and B) / P(B)
      // Event A is defined by (type, x1, x2) - but we need a sub-type for A in conditional mode
      // Let's assume for simplicity that in conditional mode, we use a sub-type for A
    }

    switch (type) {
      case 'below':
        prob = normalCDF(x1, mean, stdDev);
        steps.push(`נחשב את ציון התקן עבור [MATH]X = ${x1}[/MATH]:`);
        steps.push(`[MATH]Z = \\frac{X - \\mu}{\\sigma} = \\frac{${x1} - ${mean}}{${stdDev}} = ${z1.toFixed(4)}[/MATH]`);
        
        if (z1 < 0) {
          const absZ = Math.abs(z1);
          const phiAbsZ = normalCDF(absZ, 0, 1);
          steps.push(`מכיוון ש-[MATH]Z[/MATH] שלילי, נשתמש בתכונת הסימטריה:`);
          steps.push(`[MATH]P(Z < ${z1.toFixed(4)}) = P(Z > ${absZ.toFixed(4)}) = 1 - \\Phi(${absZ.toFixed(4)})[/MATH]`);
          steps.push(`נחפש בטבלה את [MATH]\\Phi(${absZ.toFixed(4)}) = ${phiAbsZ.toFixed(4)}[/MATH]:`);
          steps.push(`[MATH]1 - ${phiAbsZ.toFixed(4)} = ${prob.toFixed(4)}[/MATH]`);
        } else {
          steps.push(`נחפש בטבלת ההתפלגות הנורמלית את השטח משמאל ל-[MATH]Z = ${z1.toFixed(4)}[/MATH]:`);
          steps.push(`[MATH]P(X < ${x1}) = P(Z < ${z1.toFixed(4)}) = ${prob.toFixed(4)}[/MATH]`);
        }
        steps.push(`תוצאה סופית: ההסתברות היא [MATH]${prob.toFixed(4)}[/MATH] (או [MATH]${(prob * 100).toFixed(2)}\\%[/MATH])`);
        return { probability: prob, z1, steps };
      
      case 'above':
        prob = 1 - normalCDF(x1, mean, stdDev);
        steps.push(`נחשב את ציון התקן עבור [MATH]X = ${x1}[/MATH]:`);
        steps.push(`[MATH]Z = \\frac{X - \\mu}{\\sigma} = \\frac{${x1} - ${mean}}{${stdDev}} = ${z1.toFixed(4)}[/MATH]`);
        
        if (z1 < 0) {
          const absZ = Math.abs(z1);
          const phiAbsZ = normalCDF(absZ, 0, 1);
          steps.push(`אנחנו רוצים את השטח מימין ל-[MATH]Z[/MATH] שלילי:`);
          steps.push(`[MATH]P(Z > ${z1.toFixed(4)}) = P(Z < ${absZ.toFixed(4)}) = \\Phi(${absZ.toFixed(4)})[/MATH]`);
          steps.push(`נחפש בטבלה את [MATH]\\Phi(${absZ.toFixed(4)}) = ${phiAbsZ.toFixed(4)}[/MATH]`);
        } else {
          const phiZ = normalCDF(z1, 0, 1);
          steps.push(`נחפש את השטח משמאל ל-[MATH]Z[/MATH] ואז נחסיר מ-1 (כי אנחנו רוצים את השטח מימין):`);
          steps.push(`[MATH]P(X > ${x1}) = 1 - P(Z < ${z1.toFixed(4)}) = 1 - ${phiZ.toFixed(4)} = ${prob.toFixed(4)}[/MATH]`);
        }
        steps.push(`תוצאה סופית: ההסתברות היא [MATH]${prob.toFixed(4)}[/MATH] (או [MATH]${(prob * 100).toFixed(2)}\\%[/MATH])`);
        return { probability: prob, z1, steps };

      case 'between':
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minZ = (minX - mean) / stdDev;
        const maxZ = (maxX - mean) / stdDev;
        const pMax = normalCDF(maxX, mean, stdDev);
        const pMin = normalCDF(minX, mean, stdDev);
        prob = pMax - pMin;
        steps.push(`נחשב את ציוני התקן עבור שני הערכים:`);
        steps.push(`[MATH]Z_1 = \\frac{${minX} - ${mean}}{${stdDev}} = ${minZ.toFixed(4)}[/MATH]`);
        steps.push(`[MATH]Z_2 = \\frac{${maxX} - ${mean}}{${stdDev}} = ${maxZ.toFixed(4)}[/MATH]`);
        steps.push(`השטח בין הערכים הוא ההפרש בין השטחים המצטברים:`);
        steps.push(`[MATH]P(${minX} < X < ${maxX}) = P(Z < ${maxZ.toFixed(4)}) - P(Z < ${minZ.toFixed(4)})[/MATH]`);
        steps.push(`[MATH]= ${pMax.toFixed(4)} - ${pMin.toFixed(4)} = ${prob.toFixed(4)}[/MATH]`);
        steps.push(`תוצאה סופית: ההסתברות היא [MATH]${prob.toFixed(4)}[/MATH] (או [MATH]${(prob * 100).toFixed(2)}\\%[/MATH])`);
        return { probability: prob, z1: minZ, z2: maxZ, steps };

      case 'outside':
        const sX = Math.min(x1, x2);
        const eX = Math.max(x1, x2);
        const sZ = (sX - mean) / stdDev;
        const eZ = (eX - mean) / stdDev;
        const pS = normalCDF(sX, mean, stdDev);
        const pE = 1 - normalCDF(eX, mean, stdDev);
        prob = pS + pE;
        steps.push(`נחשב את ציוני התקן עבור שני הקצוות:`);
        steps.push(`[MATH]Z_1 = \\frac{${sX} - ${mean}}{${stdDev}} = ${sZ.toFixed(4)}[/MATH]`);
        steps.push(`[MATH]Z_2 = \\frac{${eX} - ${mean}}{${stdDev}} = ${eZ.toFixed(4)}[/MATH]`);
        steps.push(`השטח מחוץ לטווח הוא סכום השטחים בקצוות:`);
        steps.push(`[MATH]P(X < ${sX} \\text{ או } X > ${eX}) = P(Z < ${sZ.toFixed(4)}) + P(Z > ${eZ.toFixed(4)})[/MATH]`);
        steps.push(`[MATH]= ${pS.toFixed(4)} + ${pE.toFixed(4)} = ${prob.toFixed(4)}[/MATH]`);
        steps.push(`תוצאה סופית: ההסתברות היא [MATH]${prob.toFixed(4)}[/MATH] (או [MATH]${(prob * 100).toFixed(2)}\\%[/MATH])`);
        return { probability: prob, z1: sZ, z2: eZ, steps };

      case 'conditional':
        // Event A: defined by x1 (and x2 if between)
        // For simplicity in UI, let's make A always 'below' or 'above' or 'between' based on a sub-selector
        // But for now, let's use the main x1, x2 and a fixed 'above' for A for demo, or better:
        // Let's use x1, x2 for Event A (below/above/between) and condX1, condX2 for Event B
        
        const getProb = (t: string, v1: number, v2: number) => {
          if (t === 'below') return normalCDF(v1, mean, stdDev);
          if (t === 'above') return 1 - normalCDF(v1, mean, stdDev);
          if (t === 'between') return Math.abs(normalCDF(v2, mean, stdDev) - normalCDF(v1, mean, stdDev));
          return 0;
        };

        const probB = getProb(condType, condX1, condX2);
        
        // Intersection A and B
        // This is tricky to automate for all cases, let's do common ones or use a numeric integration/sampling
        // Or just define A as a range [a1, a2] and B as [b1, b2]
        const getRange = (t: string, v1: number, v2: number): [number, number] => {
          if (t === 'below') return [-Infinity, v1];
          if (t === 'above') return [v1, Infinity];
          return [Math.min(v1, v2), Math.max(v1, v2)];
        };

        const rangeA = getRange('below', x1, x2); // Defaulting A to 'below' for now in logic, will add UI toggle
        const rangeB = getRange(condType, condX1, condX2);

        const intersectStart = Math.max(rangeA[0], rangeB[0]);
        const intersectEnd = Math.min(rangeA[1], rangeB[1]);

        let probAandB = 0;
        if (intersectStart < intersectEnd) {
          const pStart = intersectStart === -Infinity ? 0 : normalCDF(intersectStart, mean, stdDev);
          const pEnd = intersectEnd === Infinity ? 1 : normalCDF(intersectEnd, mean, stdDev);
          probAandB = pEnd - pStart;
        }

        prob = probB > 0 ? probAandB / probB : 0;

        steps.push(`נחשב הסתברות מותנית לפי הנוסחה: [MATH]P(A|B) = \\frac{P(A \\cap B)}{P(B)}[/MATH]`);
        steps.push(`מאורע B (התנאי): [MATH]X[/MATH] בטווח [MATH]${rangeB[0] === -Infinity ? '(-\\infty' : '[' + rangeB[0]}${','}${rangeB[1] === Infinity ? '\\infty)' : rangeB[1] + ']'}[/MATH]`);
        steps.push(`[MATH]P(B) = ${probB.toFixed(4)}[/MATH]`);
        steps.push(`החיתוך [MATH]A \\cap B[/MATH]: [MATH]X[/MATH] בטווח [MATH]${intersectStart === -Infinity ? '(-\\infty' : '[' + intersectStart}${','}${intersectEnd === Infinity ? '\\infty)' : intersectEnd + ']'}[/MATH]`);
        steps.push(`[MATH]P(A \\cap B) = ${probAandB.toFixed(4)}[/MATH]`);
        steps.push(`[MATH]P(A|B) = \\frac{${probAandB.toFixed(4)}}{${probB.toFixed(4)}} = ${prob.toFixed(4)}[/MATH]`);
        steps.push(`תוצאה סופית: ההסתברות המותנית היא [MATH]${prob.toFixed(4)}[/MATH]`);
        
        return { probability: prob, z1: (x1-mean)/stdDev, steps };
      
      default:
        return { probability: 0, z1: 0, steps: [] };
    }
  }, [mean, stdDev, type, x1, x2, condType, condX1, condX2]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100" dir="rtl">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Calculator size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">מחשבון התפלגות נורמלית</h1>
          </div>
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Info size={16} />
            <span>כלי עזר לסטודנטים</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Input Controls */}
        <section className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <RefreshCw size={18} className="text-blue-600" />
              פרמטרים של ההתפלגות
            </h2>
            
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">תוחלת (μ)</label>
                <input 
                  type="number" 
                  value={mean} 
                  onChange={(e) => setMean(Number(e.target.value))}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none font-medium text-slate-800"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">סטיית תקן (σ)</label>
                <input 
                  type="number" 
                  value={stdDev} 
                  min="0.0001"
                  onChange={(e) => setStdDev(Math.max(0.0001, Number(e.target.value)))}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none font-medium text-slate-800"
                />
              </div>
            </div>

            <h2 className="text-lg font-semibold mb-4">סוג החישוב</h2>
            <div className="grid grid-cols-2 gap-2 mb-8">
              {[
                { id: 'below', label: 'מתחת ל-X' },
                { id: 'above', label: 'מעל ל-X' },
                { id: 'between', label: 'בין X₁ ל-X₂' },
                { id: 'outside', label: 'מחוץ ל-X₁ ו-X₂' },
                { id: 'conditional', label: 'הסתברות מותנית' }
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setType(item.id as CalcType)}
                  className={`px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    type === item.id 
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-100' 
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {type === 'conditional' ? (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6 p-4 bg-blue-50/30 rounded-2xl border border-blue-100"
                >
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-blue-700">מאורע A (ההסתברות המבוקשת): X &lt; x</h3>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">ערך x:</label>
                        <input 
                          type="number" 
                          value={x1} 
                          onChange={(e) => setX1(Number(e.target.value))}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 border-t border-blue-100 pt-4">
                    <h3 className="text-sm font-bold text-blue-700">מאורע B (התנאי):</h3>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">סוג התנאי:</label>
                        <select 
                          value={condType}
                          onChange={(e) => setCondType(e.target.value as CondType)}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none"
                        >
                          <option value="below">X &lt; x</option>
                          <option value="above">X &gt; x</option>
                          <option value="between">x1 &lt; X &lt; x2</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">{condType === 'between' ? 'x1:' : 'ערך x:'}</label>
                          <input 
                            type="number" 
                            value={condX1} 
                            onChange={(e) => setCondX1(Number(e.target.value))}
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none"
                          />
                        </div>
                        {condType === 'between' && (
                          <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">x2:</label>
                            <input 
                              type="number" 
                              value={condX2} 
                              onChange={(e) => setCondX2(Number(e.target.value))}
                              className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">
                      {type === 'between' || type === 'outside' ? 'ערך X₁' : 'ערך X'}
                    </label>
                    <input 
                      type="number" 
                      value={x1} 
                      onChange={(e) => setX1(Number(e.target.value))}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none font-medium text-slate-800"
                    />
                  </div>
                  
                  {(type === 'between' || type === 'outside') && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-2"
                    >
                      <label className="text-sm font-semibold text-slate-700">ערך X₂</label>
                      <input 
                        type="number" 
                        value={x2} 
                        onChange={(e) => setX2(Number(e.target.value))}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none font-medium text-slate-800"
                      />
                    </motion.div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="bg-blue-600 rounded-2xl p-6 text-white shadow-xl shadow-blue-200">
            <div className="text-blue-100 text-sm mb-1">הסתברות (P)</div>
            <div className="text-4xl font-bold">{(result.probability * 100).toFixed(2)}%</div>
            <div className="text-blue-100 text-xs mt-2">ערך עשרוני: {result.probability.toFixed(4)}</div>
          </div>
        </section>

        {/* Visualization & Steps */}
        <section className="lg:col-span-7 space-y-6">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <HelpCircle size={18} className="text-blue-600" />
              תצוגה ויזואלית
            </h2>
            <NormalChart 
              mean={mean} 
              stdDev={stdDev} 
              type={type} 
              x1={x1} 
              x2={x2} 
              condType={condType}
              condX1={condX1}
              condX2={condX2}
            />
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <Calculator size={18} className="text-blue-600" />
              שלבי החישוב
            </h2>
            <div className="space-y-4">
              {result.steps.map((step, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex gap-4 items-start"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-sm font-bold text-blue-600 shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <FormattedStep text={step} />
                </motion.div>
              ))}
            </div>

            <ZTable activeZ={result.z1} />
            {result.z2 !== undefined && <ZTable activeZ={result.z2} />}
          </div>
        </section>
      </main>

      <footer className="max-w-5xl mx-auto px-4 py-12 text-center text-slate-400 text-sm">
        <p>© {new Date().getFullYear()} מחשבון התפלגות נורמלית - פותח עבור סטודנטים לסטטיסטיקה</p>
      </footer>
    </div>
  );
}
