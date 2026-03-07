/**
 * Task 31: 材料价格信息库 - 基准价管理 API 测试脚本
 * 
 * 测试所有 API 端点的功能
 */

const BASE_URL = 'http://localhost:3001';
let authToken = '';

// 测试结果统计
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

// 辅助函数：发送请求
async function request(method, path, data = null, useAuth = false) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  if (useAuth && authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  console.log(`  请求: ${method} ${url}`);
  
  try {
    const response = await fetch(url, options);
    const responseText = await response.text();
    
    try {
      return JSON.parse(responseText);
    } catch (e) {
      console.log(`  响应非JSON: ${responseText.substring(0, 200)}`);
      return { success: false, message: 'Invalid JSON response' };
    }
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// 测试函数
async function test(name, fn) {
  console.log(`\n测试: ${name}`);
  try {
    await fn();
    results.passed++;
    results.tests.push({ name, status: 'passed' });
    console.log(`✅ ${name} - 通过`);
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: 'failed', error: error.message });
    console.log(`❌ ${name} - 失败: ${error.message}`);
  }
}

// 断言函数
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || '断言失败');
  }
}

// 测试套件
async function runTests() {
  console.log('====================================');
  console.log('Task 31: 材料价格信息库 API 测试');
  console.log('====================================\n');
  
  // 1. 登录获取 token
  await test('登录获取认证 Token', async () => {
    // 先检查用户
    const checkResponse = await request('POST', '/auth/check-user', {
      account: 'admin'
    });
    console.log(`  检查用户: ${checkResponse.success ? '用户存在' : '用户不存在'}`);
    
    const response = await request('POST', '/auth/login-password', {
      account: 'admin',
      password: '123456'
    });
    assert(response.success, '登录失败: ' + (response.message || ''));
    assert(response.token, '未获取到 token');
    authToken = response.token;
  });
  
  // 2. 测试获取材料基准价列表
  await test('GET /api/materials/base - 获取材料基准价列表', async () => {
    const response = await request('GET', '/api/materials/base', null, true);
    assert(response.success, '获取列表失败');
    assert(Array.isArray(response.data), '返回数据格式错误');
    console.log(`  返回 ${response.data.length} 条记录`);
  });
  
  // 3. 测试创建材料基准价
  let materialId;
  await test('POST /api/materials - 创建材料基准价', async () => {
    const response = await request('POST', '/api/materials', {
      material_name: `测试材料_${Date.now()}`,
      specification: '规格A',
      unit: '个',
      base_price: 100.00,
      effective_date: '2026-01-01',
      remarks: '测试材料基准价'
    }, true);
    assert(response.success, '创建失败: ' + (response.message || ''));
    assert(response.data && response.data.id, '返回数据缺少 id');
    materialId = response.data.id;
    console.log(`  创建成功，ID: ${materialId}`);
  });
  
  // 4. 测试获取单个材料详情
  if (materialId) {
    await test('GET /api/materials/:id - 获取材料详情', async () => {
      const response = await request('GET', `/api/materials/${materialId}`, null, true);
      assert(response.success, '获取详情失败');
      assert(response.data && response.data.id === materialId, '返回数据 id 不匹配');
      console.log(`  获取成功: ${response.data.material_name}`);
    });
  }
  
  // 5. 测试更新材料基准价
  if (materialId) {
    await test('PUT /api/materials/:id - 更新材料基准价', async () => {
      const response = await request('PUT', `/api/materials/${materialId}`, {
        base_price: 120.00,
        remarks: '更新后的备注'
      }, true);
      assert(response.success, '更新失败');
      assert(response.data && response.data.base_price === 120.00, '价格未更新');
      console.log(`  更新成功，新价格: ${response.data.base_price}`);
    });
  }
  
  // 6. 测试批量更新基准价
  await test('PUT /api/materials/base-price - 批量更新基准价', async () => {
    const response = await request('PUT', '/api/materials/base-price', {
      updates: [
        { id: materialId, base_price: 150.00 }
      ],
      reason: '批量测试更新'
    }, true);
    assert(response.success, '批量更新失败');
    console.log(`  批量更新结果: ${response.message}`);
  });
  
  // 7. 测试价格预警检查
  await test('POST /api/materials/price-warning - 价格预警检查', async () => {
    const response = await request('POST', '/api/materials/price-warning', {
      items: [
        {
          material_name: '测试材料',
          specification: '规格A',
          unit_price: 200,  // 高于基准价
          quantity: 10
        },
        {
          material_name: '不存在材料',
          specification: '',
          unit_price: 50,
          quantity: 5
        }
      ]
    }, true);
    assert(response.success, '价格预警检查失败');
    console.log(`  预警项目数: ${response.data.warningCount}`);
    console.log(`  正常项目数: ${response.data.normalCount}`);
  });
  
  // 8. 测试获取供应商列表
  await test('POST /api/materials/:id/suppliers - 获取供应商列表', async () => {
    if (!materialId) throw new Error('没有可用的材料 ID');
    const response = await request('POST', `/api/materials/${materialId}/suppliers`, {
      keyword: ''
    }, true);
    assert(response.success, '获取供应商列表失败');
    console.log(`  供应商数量: ${response.data.length}`);
  });
  
  // 9. 测试添加供应商
  let supplierId;
  await test('PUT /api/materials/suppliers - 添加供应商', async () => {
    const response = await request('PUT', '/api/materials/suppliers', {
      name: `测试供应商_${Date.now()}`,
      contact_person: '张三',
      phone: '13800138000',
      email: 'test@example.com',
      address: '测试地址'
    }, true);
    assert(response.success, '添加供应商失败');
    assert(response.data && response.data.id, '返回数据缺少 id');
    supplierId = response.data.id;
    console.log(`  添加成功，ID: ${supplierId}`);
  });
  
  // 10. 测试价格检查
  if (materialId) {
    await test('POST /api/materials/:id/price-check - 价格检查', async () => {
      const response = await request('POST', `/api/materials/${materialId}/price-check`, {
        quantity: 100,
        unit_price: 200,  // 高于基准价
        reason: '测试价格检查'
      }, true);
      assert(response.success, '价格检查失败');
      console.log(`  是否超量: ${response.data.is_overage}`);
      console.log(`  是否需要预算员审批: ${response.data.need_budget_approval}`);
    });
  }
  
  // 11. 测试超量检查
  if (materialId) {
    await test('PUT /api/materials/:id/overcheck - 超量检查', async () => {
      const response = await request('PUT', `/api/materials/${materialId}/overcheck`, {
        project_id: 1,
        items: [
          {
            quantity: 100,
            unit_price: 200
          }
        ]
      }, true);
      assert(response.success, '超量检查失败');
      console.log(`  是否有超量: ${response.data.has_overage}`);
    });
  }
  
  // 12. 测试导出材料基准价
  await test('GET /api/materials/export - 导出材料基准价', async () => {
    const response = await request('GET', '/api/materials/export?status=active', null, true);
    assert(response.success, '导出失败');
    console.log(`  导出记录数: ${response.total}`);
  });
  
  // 13. 测试获取价格历史
  if (materialId) {
    await test('GET /api/materials/price-history/:id - 获取价格历史', async () => {
      const response = await request('GET', `/api/materials/price-history/${materialId}`, null, true);
      assert(response.success, '获取价格历史失败');
      console.log(`  历史记录数: ${response.data.length}`);
    });
  }
  
  // 14. 测试删除材料
  if (materialId) {
    await test('DELETE /api/materials/:id - 删除材料', async () => {
      const response = await request('DELETE', `/api/materials/${materialId}`, null, true);
      assert(response.success, '删除失败');
      console.log(`  删除成功`);
    });
  }
  
  // 15. 验证删除后不能再次删除
  if (materialId) {
    await test('DELETE /api/materials/:id - 重复删除应失败', async () => {
      const response = await request('DELETE', `/api/materials/${materialId}`, null, true);
      assert(!response.success, '重复删除不应成功');
      assert(response.message.includes('已被删除'), '错误消息不正确');
      console.log(`  正确返回错误: ${response.message}`);
    });
  }
  
  // 打印测试结果汇总
  console.log('\n====================================');
  console.log('测试结果汇总');
  console.log('====================================');
  console.log(`通过: ${results.passed}`);
  console.log(`失败: ${results.failed}`);
  console.log(`总计: ${results.passed + results.failed}`);
  
  if (results.failed > 0) {
    console.log('\n失败的测试:');
    results.tests
      .filter(t => t.status === 'failed')
      .forEach(t => console.log(`  - ${t.name}: ${t.error}`));
  }
  
  process.exit(results.failed > 0 ? 1 : 0);
}

// 运行测试
runTests().catch(error => {
  console.error('测试执行出错:', error);
  process.exit(1);
});
