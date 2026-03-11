import { useState, useEffect, useRef } from 'react';
import { Card, Row, Col, Statistic, Select, DatePicker, Spin } from 'antd';
import * as echarts from 'echarts';
import dayjs from 'dayjs';
import axios from 'axios';

const { Option } = Select;
const { RangePicker } = DatePicker;

function FinanceChart() {
  const chartRef1 = useRef(null);
  const chartRef2 = useRef(null);
  const chartRef3 = useRef(null);
  const [loading, setLoading] = useState(false);
  const [statistics, setStatistics] = useState({
    totalIncome: 0,
    totalExpense: 0,
    profit: 0,
    byCategory: []
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (statistics.byCategory.length > 0) {
      renderCharts();
    }
  }, [statistics]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      // 获取收入合同统计
      const incomeRes = await axios.get('http://localhost:3001/api/contracts?type=income&pageSize=1000', { headers });
      const incomeContracts = incomeRes.data.data || [];
      const totalIncome = incomeContracts.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);

      // 获取支出合同统计
      const expenseRes = await axios.get('http://localhost:3001/api/contracts?type=expense&pageSize=1000', { headers });
      const expenseContracts = expenseRes.data.data || [];
      const totalExpense = expenseContracts.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);

      // 按项目分类统计
      const categoryMap = {};
      expenseContracts.forEach(c => {
        const projectName = c.project_name || '未分类';
        if (!categoryMap[projectName]) {
          categoryMap[projectName] = 0;
        }
        categoryMap[projectName] += parseFloat(c.amount) || 0;
      });

      const byCategory = Object.entries(categoryMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

      setStatistics({
        totalIncome,
        totalExpense,
        profit: totalIncome - totalExpense,
        byCategory
      });
    } catch (error) {
      console.error('获取统计数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderCharts = () => {
    // 收入支出对比饼图
    if (chartRef1.current) {
      const chart1 = echarts.init(chartRef1.current);
      chart1.setOption({
        title: {
          text: '收入支出对比',
          left: 'center'
        },
        tooltip: {
          trigger: 'item',
          formatter: '{a} <br/>{b}: ¥{c} ({d}%)'
        },
        legend: {
          orient: 'vertical',
          left: 'left',
          top: 'middle'
        },
        series: [
          {
            name: '金额',
            type: 'pie',
            radius: ['40%', '70%'],
            center: ['60%', '50%'],
            avoidLabelOverlap: false,
            itemStyle: {
              borderRadius: 10,
              borderColor: '#fff',
              borderWidth: 2
            },
            label: {
              show: true,
              formatter: '{b}: ¥{c}'
            },
            emphasis: {
              label: {
                show: true,
                fontSize: 16,
                fontWeight: 'bold'
              }
            },
            data: [
              { value: statistics.totalIncome, name: '收入', itemStyle: { color: '#52c41a' } },
              { value: statistics.totalExpense, name: '支出', itemStyle: { color: '#ff4d4f' } }
            ]
          }
        ]
      });
    }

    // 支出分类饼图
    if (chartRef2.current) {
      const chart2 = echarts.init(chartRef2.current);
      chart2.setOption({
        title: {
          text: '支出按项目分布',
          left: 'center'
        },
        tooltip: {
          trigger: 'item',
          formatter: '{a} <br/>{b}: ¥{c} ({d}%)'
        },
        legend: {
          orient: 'vertical',
          left: 'left',
          top: 'middle'
        },
        series: [
          {
            name: '支出',
            type: 'pie',
            radius: '60%',
            center: ['60%', '50%'],
            data: statistics.byCategory,
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            }
          }
        ]
      });
    }

    // 利润率环形图
    if (chartRef3.current) {
      const chart3 = echarts.init(chartRef3.current);
      const profitRate = statistics.totalIncome > 0 
        ? ((statistics.profit / statistics.totalIncome) * 100).toFixed(1) 
        : 0;
      
      chart3.setOption({
        title: {
          text: '利润率',
          left: 'center',
          top: '45%',
          textStyle: {
            fontSize: 24,
            fontWeight: 'bold'
          }
        },
        tooltip: {
          formatter: '{a} <br/>{b} : {c}%'
        },
        series: [
          {
            name: '利润率',
            type: 'gauge',
            radius: '100%',
            center: ['50%', '60%'],
            progress: {
              show: true,
              width: 18
            },
            axisLine: {
              lineStyle: {
                width: 18
              }
            },
            axisTick: {
              show: false
            },
            splitLine: {
              length: 15,
              lineStyle: {
                width: 2,
                color: '#999'
              }
            },
            axisLabel: {
              distance: 25,
              fontSize: 12
            },
            anchor: {
              show: true,
              showAbove: true,
              size: 25,
              itemStyle: {
                borderWidth: 10
              }
            },
            title: {
              show: false
            },
            detail: {
              valueAnimation: true,
              fontSize: 28,
              offsetCenter: [0, '70%'],
              formatter: '{value}%'
            },
            data: [
              {
                value: profitRate,
                itemStyle: {
                  color: profitRate >= 20 ? '#52c41a' : profitRate >= 10 ? '#faad14' : '#ff4d4f'
                }
              }
            ]
          }
        ]
      });
    }
  };

  return (
    <div className="finance-chart">
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总收入"
              value={statistics.totalIncome}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="总支出"
              value={statistics.totalExpense}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="利润"
              value={statistics.profit}
              precision={2}
              prefix="¥"
              valueStyle={{ color: statistics.profit >= 0 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="利润率"
              value={statistics.totalIncome > 0 ? ((statistics.profit / statistics.totalIncome) * 100).toFixed(1) : 0}
              suffix="%"
              valueStyle={{ color: statistics.profit >= 0 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 图表 */}
      <Spin spinning={loading}>
        <Row gutter={16}>
          <Col span={12}>
            <Card>
              <div ref={chartRef1} style={{ height: 350 }} />
            </Card>
          </Col>
          <Col span={12}>
            <Card>
              <div ref={chartRef2} style={{ height: 350 }} />
            </Card>
          </Col>
        </Row>
        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={12}>
            <Card>
              <div ref={chartRef3} style={{ height: 300 }} />
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  );
}

export default FinanceChart;
