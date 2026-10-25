package org.example.backend.runner;

import org.example.backend.entity.User;
import org.example.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.List;

@Component
@Profile({"dev", "local", "qa"})
public class DataFixerRunner8 implements CommandLineRunner {

    @Autowired
    private UserRepository userRepository;

    @Override
    @Transactional
    public void run(String... args) throws Exception {
        System.out.println("=== Running DataFixerRunner8 (Replace test users with real names) ===");

        List<User> users = userRepository.findAll();
        
        List<String[]> realNames = Arrays.asList(
            new String[]{"Nguyễn Văn An", "nguyen.van.an", "nguyenvanan@gmail.com"},
            new String[]{"Trần Thị Bích", "tran.thi.bich", "tranthibich@gmail.com"},
            new String[]{"Lê Hoàng Nam", "le.hoang.nam", "lehoangnam@gmail.com"},
            new String[]{"Phạm Thu Thảo", "pham.thu.thao", "phamthuthao@gmail.com"},
            new String[]{"Võ Minh Tuấn", "vo.minh.tuan", "vominhtuan@gmail.com"},
            new String[]{"Đỗ Mỹ Linh", "do.my.linh", "domylinh@gmail.com"},
            new String[]{"Bùi Tuấn Anh", "bui.tuan.anh", "buituananh@gmail.com"},
            new String[]{"Hoàng Phương Ly", "hoang.phuong.ly", "hoangphuongly@gmail.com"},
            new String[]{"Phan Trọng Khang", "phan.trong.khang", "phantrongkhang@gmail.com"},
            new String[]{"Ngô Thanh Trúc", "ngo.thanh.truc", "ngothanhtruc@gmail.com"},
            new String[]{"Lý Quốc Bảo", "ly.quoc.bao", "lyquocbao@gmail.com"},
            new String[]{"Huỳnh Yến Nhi", "huynh.yen.nhi", "huynhyennhi@gmail.com"},
            new String[]{"Đặng Thành Đạt", "dang.thanh.dat", "dangthanhdat@gmail.com"},
            new String[]{"Mai Quốc Việt", "mai.quoc.viet", "maiquocviet@gmail.com"},
            new String[]{"Trịnh Khắc Huy", "trinh.khac.huy", "trinhkhachuy@gmail.com"}
        );

        int count = 0;
        int nameIndex = 0;

        for (User user : users) {
            String uname = user.getUsername();
            if (uname != null && (uname.toLowerCase().startsWith("test") || uname.toLowerCase().startsWith("dummy") || uname.toLowerCase().startsWith("demo"))) {
                // If it's the main testadmin, we might want to skip it if the user wants to keep it, 
                // but the prompt says "xóa dữ liệu tên test đi". We'll replace all.
                
                String[] newReal = realNames.get(nameIndex % realNames.size());
                String fullName = newReal[0];
                String username = newReal[1];
                String email = newReal[2];
                
                // Prevent duplicate usernames by appending a number if we loop through the list
                int loopCount = nameIndex / realNames.size();
                if (loopCount > 0) {
                    username = username + loopCount;
                    email = email.replace("@", loopCount + "@");
                    fullName = fullName + " " + loopCount;
                }

                System.out.println("Updating user " + uname + " -> " + username + " (" + fullName + ")");
                user.setUsername(username);
                user.setFullName(fullName);
                user.setEmail(email);
                
                userRepository.save(user);
                
                nameIndex++;
                count++;
            }
        }

        System.out.println("=== DataFixerRunner8 finished. Updated " + count + " users ===");
    }
}
