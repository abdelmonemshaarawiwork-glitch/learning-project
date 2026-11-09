import { describe, expect, it } from 'vitest';
import { evaluateThresholds, type ObservationThreshold } from './index';

const hr: ObservationThreshold = { id: 't1', parameterId: 'heart-rate', field: 'value', unit: 'bpm', low: 50, high: 120, source: 'local', enabled: true };
const dia: ObservationThreshold = { id: 't2', parameterId: 'blood-pressure', field: 'value2', unit: 'mmHg', low: 40, high: null, source: '', enabled: true };

describe('thresholds', () => {
  it('reports above/below/within with the threshold used', () => {
    const above = evaluateThresholds({ parameter: 'heart-rate', value: 130, value2: null, unit: 'bpm' }, [hr]);
    expect(above[0]!.status).toBe('above');
    expect(above[0]!.thresholdText).toContain('high > 120 bpm');
    expect(evaluateThresholds({ parameter: 'heart-rate', value: 45, value2: null, unit: 'bpm' }, [hr])[0]!.status).toBe('below');
    expect(evaluateThresholds({ parameter: 'heart-rate', value: 120, value2: null, unit: 'bpm' }, [hr])[0]!.status).toBe('within');
  });
  it('ignores disabled thresholds, other parameters and unit mismatches', () => {
    expect(evaluateThresholds({ parameter: 'heart-rate', value: 200, value2: null, unit: 'bpm' }, [{ ...hr, enabled: false }])).toEqual([]);
    expect(evaluateThresholds({ parameter: 'spo2', value: 80, value2: null, unit: '%' }, [hr])).toEqual([]);
    expect(evaluateThresholds({ parameter: 'heart-rate', value: 200, value2: null, unit: 'beats' }, [hr])).toEqual([]);
  });
  it('can evaluate the diastolic value', () => {
    expect(evaluateThresholds({ parameter: 'blood-pressure', value: 110, value2: 35, unit: 'mmHg' }, [dia])[0]!.status).toBe('below');
  });
});
