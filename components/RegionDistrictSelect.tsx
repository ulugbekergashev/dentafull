import React from 'react';
import { Select } from './Common';
import { useLanguage } from '../context/LanguageContext';
import { DHP_STATES, DhpCode, districtsOfState } from '../utils/dhpCodes';

interface RegionDistrictSelectProps {
    regionCode?: string | null;
    districtCode?: string | null;
    onChange: (value: { regionCode: string; districtCode: string }) => void;
    className?: string;
}

// Viloyat va tuman — DHP (davlat platformasi) SOATO kodlari bilan.
// Erkin "Manzil" matnining o'rnini bosmaydi, yoniga qo'yiladi: platforma
// manzilni kodlangan holda talab qiladi, ko'cha/uy esa matn bo'lib qoladi.
export const RegionDistrictSelect: React.FC<RegionDistrictSelectProps> = ({ regionCode, districtCode, onChange, className = '' }) => {
    const { t, language } = useLanguage();
    const label = (c: DhpCode) => (language === 'ru' ? c.ru : c.uz);
    const region = regionCode || '';

    return (
        <div className={`grid grid-cols-2 gap-3 ${className}`}>
            <Select
                label={t('patients.modal.state')}
                value={region}
                onChange={e => onChange({ regionCode: e.target.value, districtCode: '' })}
                options={[{ value: '', label: '—' }, ...DHP_STATES.map(s => ({ value: s.code, label: label(s) }))]}
            />
            <Select
                label={t('patients.modal.district')}
                value={districtCode || ''}
                disabled={!region}
                onChange={e => onChange({ regionCode: region, districtCode: e.target.value })}
                options={[{ value: '', label: '—' }, ...districtsOfState(region).map(d => ({ value: d.code, label: label(d) }))]}
            />
        </div>
    );
};
