package org.example.backend.runner;

import org.example.backend.entity.Cost;
import org.example.backend.entity.CostCategory;
import org.example.backend.repository.CostCategoryRepository;
import org.example.backend.repository.CostRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import org.springframework.context.annotation.Profile;

@Component
@Profile({"dev", "local", "qa"})
public class DataFixerRunner6 implements CommandLineRunner {

    @Autowired
    private CostRepository costRepo;

    @Autowired
    private CostCategoryRepository categoryRepo;

    @Override
    @Transactional
    public void run(String... args) throws Exception {
        System.out.println("=== Running DataFixerRunner6 (Exact Costs) ===");

        costRepo.deleteAll();

        CostCategory mayChu = findOrCreate("Máy chủ & lưu trữ");
        CostCategory aiApi = findOrCreate("AI API");
        CostCategory db = findOrCreate("Cơ sở dữ liệu");
        CostCategory domain = findOrCreate("Tên miền & bảo mật");
        CostCategory monitor = findOrCreate("Giám sát hệ thống");
        CostCategory email = findOrCreate("Email & thông báo");

        int currentYear = LocalDateTime.now().getYear();
        int currentMonth = LocalDateTime.now().getMonthValue();

        Object[][] data = {
            {mayChu, 40000, 1},
            {db, 50000, 3},
            {mayChu, 40000, 3},
            {aiApi, 105000, 5},
            {email, 5000, 5},
            {db, 30000, 7},
            {domain, 60000, 10},
            {monitor, 30000, 11},
            {monitor, 30000, 13},
            {domain, 10000, 13},
            {email, 20000, 15},
            {email, 20000, LocalDateTime.now().getDayOfMonth()},
            {mayChu, 60000, LocalDateTime.now().getDayOfMonth()}
        };

        for (Object[] row : data) {
            CostCategory cat = (CostCategory) row[0];
            int amount = (Integer) row[1];
            int day = (Integer) row[2];

            // Ensure day is valid for current month
            if (day > LocalDateTime.now().getDayOfMonth()) {
                day = LocalDateTime.now().getDayOfMonth(); // Don't put future costs
            }

            Cost cost = new Cost();
            cost.setCategory(cat);
            cost.setAmount(new BigDecimal(amount));
            cost.setDate(LocalDateTime.of(currentYear, currentMonth, day, 12, 0));
            cost.setName("Chi phí " + cat.getName() + " ngày " + day);
            cost.setStatus("PAID");
            costRepo.save(cost);
        }

        System.out.println("=== DataFixerRunner6 finished ===");
    }

    private CostCategory findOrCreate(String name) {
        return categoryRepo.findAll().stream()
                .filter(c -> c.getName().equals(name))
                .findFirst()
                .orElseGet(() -> {
                    CostCategory c = new CostCategory();
                    c.setName(name);
                    c.setDescription(name);
                    return categoryRepo.save(c);
                });
    }
}
