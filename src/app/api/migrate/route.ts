import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/migrate — boost_settings에 auth_required, auth_message 컬럼 추가
export async function GET() {
  try {
    // RPC로 SQL 실행 (column 추가는 직접 SQL 필요하므로 upsert로 간접 처리)
    // auth_required, auth_message 컬럼이 없으면 upsert가 무시하므로 안전
    // 대신 Supabase Dashboard에서 수동으로 추가하는 안내 반환
    
    // 테스트: 현재 boost_settings 컬럼 확인
    const { data, error } = await supabase.from('boost_settings').select('*').limit(1);
    
    const hasColumn = data && data.length > 0 && 'auth_required' in data[0];
    
    if (hasColumn) {
      return NextResponse.json({ status: 'ok', message: 'auth_required 컬럼이 이미 존재합니다' });
    }

    return NextResponse.json({
      status: 'migration_needed',
      message: 'Supabase Dashboard → SQL Editor에서 아래 SQL을 실행해주세요',
      sql: `ALTER TABLE boost_settings ADD COLUMN IF NOT EXISTS auth_required BOOLEAN DEFAULT false;
ALTER TABLE boost_settings ADD COLUMN IF NOT EXISTS auth_message TEXT;`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
